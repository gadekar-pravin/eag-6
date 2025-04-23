import json
from typing import List, Optional, Dict, Any

import models
import action
import perception
import utils
from memory import get_error_message


# --- Main Decision Logic Functions ---

def process_find_recipes(request: models.FindRecipesRequest) -> models.FindRecipesResponse:
    query = f"The user wants recipe suggestions for these ingredients: '{request.ingredients}'"
    if request.foodType and request.foodType != 'any':
        query += f", with food type preference: {request.foodType}"
    if request.cuisine and request.cuisine != 'any':
        query += f", and cuisine preference: {request.cuisine}"

    context = {
        "stage": 1,
        "userIngredients": request.ingredients,
        "preferences": {
            "foodType": request.foodType,
            "cuisine": request.cuisine
        }
    }

    llm_result = perception.run_llm_analysis(query, stage=1, context=context)

    if llm_result.error and "LLM identified issues" in llm_result.error:
        print(f"LLM identified issues: {llm_result.metadata.errors}")
        if "Invalid ingredients" in llm_result.metadata.errors:
            return models.FindRecipesResponse(
                recipes=None,
                error=f"Invalid ingredients detected: {llm_result.metadata.errors}",
                llm_prompt=llm_result.prompt,
                metadata=llm_result.metadata.dict()  # Add metadata
            )

    ingredients = request.ingredients.strip()
    api_result = action.fetch_spoonacular_recipes(
        ingredients=ingredients,
        preferences={
            "foodType": request.foodType,
            "cuisine": request.cuisine
        }
    )

    if api_result["error"]:
        print(f"Spoonacular API error: {api_result['error']}")
        return models.FindRecipesResponse(
            recipes=None,
            error=api_result["error"],
            llm_prompt=llm_result.prompt,
            metadata=llm_result.metadata.dict()  # Add metadata
        )

    recipes = []
    if api_result["data"]:
        try:
            for item in api_result["data"]:
                recipe = models.RecipeSummary(
                    id=item["id"],
                    title=item["title"],
                    image=item.get("image"),
                    usedIngredientCount=item.get("usedIngredientCount", 0),
                    missedIngredientCount=item.get("missedIngredientCount", 0)
                )
                recipes.append(recipe)
        except Exception as e:
            print(f"Error processing recipe data: {e}")
            return models.FindRecipesResponse(
                recipes=None,
                error=f"Error processing recipe data: {e}",
                llm_prompt=llm_result.prompt,
                metadata=llm_result.metadata.dict()  # Add metadata
            )

    return models.FindRecipesResponse(
        recipes=recipes,
        error=None if recipes else "No recipes found matching your ingredients and preferences.",
        llm_prompt=llm_result.prompt,
        metadata=llm_result.metadata.dict()  # Add metadata
    )


def process_get_missing_ingredients(
        request: models.GetMissingIngredientsRequest) -> models.GetMissingIngredientsResponse:
    """
    Takes selected recipe ID, title, and user's ingredients,
    runs LLM reasoning, fetches recipe details, and returns missing ingredients.
    """
    # Build query for LLM
    query = f"The user selected the recipe '{request.recipeTitle}' (ID: {request.recipeId}) and has these ingredients: {', '.join(request.userIngredients)}."
    query += " We need to determine what ingredients they're missing for this recipe."

    # Context for LLM
    context = {
        "stage": 2,
        "recipeId": request.recipeId,
        "recipeTitle": request.recipeTitle,
        "userIngredients": request.userIngredients
    }

    # Run LLM analysis (Stage 2: Get Missing Ingredients)
    llm_result = perception.run_llm_analysis(query, stage=2, context=context)

    # Call Spoonacular API for recipe details
    api_result = action.fetch_spoonacular_details(request.recipeId)

    # Handle API errors
    if api_result["error"]:
        print(f"Failed to fetch recipe details: {api_result['error']}")
        # Use fallback logic - generate estimated ingredients based on title
        fallback_ingredients = action.generate_fallback_ingredients(request.recipeTitle)

        return models.GetMissingIngredientsResponse(
            missingIngredients=fallback_ingredients,
            isEstimate=True,  # Flag these as estimates
            error=f"Could not retrieve exact recipe ingredients: {api_result['error']}",
            llm_prompt=llm_result.prompt
        )

    # Extract ingredients from recipe details
    required_ingredients = []
    try:
        recipe_data = api_result["data"]
        if "extendedIngredients" in recipe_data:
            # Convert to SpoonacularIngredient objects if not already
            if not isinstance(recipe_data["extendedIngredients"][0], models.SpoonacularIngredient):
                required_ingredients = [
                    models.SpoonacularIngredient(**ing)
                    for ing in recipe_data["extendedIngredients"]
                ]
            else:
                required_ingredients = recipe_data["extendedIngredients"]
    except Exception as e:
        print(f"Error extracting ingredients from recipe: {e}")
        fallback_ingredients = action.generate_fallback_ingredients(request.recipeTitle)
        return models.GetMissingIngredientsResponse(
            missingIngredients=fallback_ingredients,
            isEstimate=True,
            error=f"Error processing recipe ingredients: {e}",
            llm_prompt=llm_result.prompt
        )

    # Find missing ingredients using the utils module
    missing_ingredients_raw = utils.find_missing_ingredients(
        required_ingredients,
        request.userIngredients
    )

    # Convert to our IngredientDetail model
    missing_ingredients = []
    for ing in missing_ingredients_raw:
        missing_ingredients.append(models.IngredientDetail(
            id=ing.id,
            name=ing.name,
            amount=ing.amount,
            unit=ing.unit,
            is_estimate=False  # These are from the actual recipe
        ))

    # Return the response
    return models.GetMissingIngredientsResponse(
        missingIngredients=missing_ingredients,
        isEstimate=False,
        error=None,
        llm_prompt=llm_result.prompt
    )


def process_send_list(request: models.SendListRequest) -> models.SendListResponse:
    """
    Takes delivery method, details, recipe title, and missing ingredients,
    runs LLM reasoning, and sends list via appropriate channel.
    """
    # Format missing ingredients as a nicely formatted list
    formatted_ingredients = []
    for ing in request.missingIngredients:
        if ing.amount and ing.unit:
            formatted_ingredients.append(f"{ing.amount} {ing.unit} {ing.name}")
        else:
            formatted_ingredients.append(ing.name)

    ingredients_text = "\n".join(
        [f"- {ing}" for ing in formatted_ingredients]) if formatted_ingredients else "You have all needed ingredients!"

    # Build query for LLM
    query = f"The user wants to send a shopping list for the recipe '{request.recipeTitle}' via {request.deliveryMethod} to '{request.deliveryDetails}'."
    query += f" The list contains these items:\n{ingredients_text}"

    # Context for LLM
    context = {
        "stage": 3,
        "deliveryMethod": request.deliveryMethod,
        "deliveryDetails": request.deliveryDetails,
        "recipeTitle": request.recipeTitle,
        "missingIngredients": [ing.dict() for ing in request.missingIngredients]
    }

    # Run LLM analysis (Stage 3: Send List)
    llm_result = perception.run_llm_analysis(query, stage=3, context=context)

    # Format the message
    subject = f"Shopping List for {request.recipeTitle}"
    message = f"Shopping List for: {request.recipeTitle}\n\n"
    if formatted_ingredients:
        message += "Items you need:\n" + ingredients_text
    else:
        message += "Good news! You have all the ingredients needed for this recipe."

    message += "\n\nHappy cooking!\nSent via Recipe Suggester"

    # Send via appropriate channel
    if request.deliveryMethod == "telegram":
        result = action.send_telegram_message(request.deliveryDetails, message)
    else:  # email
        result = action.send_sendgrid_email(request.deliveryDetails, subject, message)

    # Return response based on send result
    return models.SendListResponse(
        success=result["success"],
        message=result["message"],
        llm_prompt=llm_result.prompt
    )