import requests
import time
import re
from typing import List, Dict, Any, Optional

# Assuming models.py defines IngredientDetail
from models import IngredientDetail, SpoonacularIngredient
from memory import get_api_key, MAX_API_RETRIES, get_error_message

# --- Helper for Retries ---
def _make_request_with_retry(method: str, url: str, **kwargs) -> requests.Response:
    """Makes an HTTP request with exponential backoff retry logic."""
    retries = 0
    last_exception = None
    while retries <= MAX_API_RETRIES:
        try:
            response = requests.request(method, url, timeout=15, **kwargs) # 15 sec timeout
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            return response
        except requests.exceptions.RequestException as e:
            last_exception = e
            retries += 1
            if retries > MAX_API_RETRIES:
                print(f"Max retries exceeded for {method} {url}. Error: {e}")
                raise e # Re-raise the last exception
            wait_time = (2 ** (retries - 1)) * 0.5 # Exponential backoff (0.5s, 1s, 2s...)
            print(f"Request failed ({e}). Retrying in {wait_time:.2f}s...")
            time.sleep(wait_time)
    # This line should technically not be reached if raise e works
    raise last_exception or Exception(f"Request failed after {MAX_API_RETRIES} retries")


# --- Spoonacular Actions ---
def fetch_spoonacular_recipes(ingredients: str, preferences: dict) -> Dict[str, Any]:
    """Fetches recipes from Spoonacular based on ingredients and preferences."""
    api_key = get_api_key('spoonacular')
    if not api_key:
        return {"data": None, "error": get_error_message("MISSING_API_KEY", "Spoonacular")}

    base_url = "https://api.spoonacular.com/recipes/findByIngredients"
    params = {
        "ingredients": ingredients,
        "number": 5,
        "ranking": 1,
        "apiKey": api_key
    }

    # Add preferences if valid
    cuisine = preferences.get('cuisine')
    food_type = preferences.get('foodType') # Corresponds to 'diet' in Spoonacular
    if cuisine and cuisine != 'any':
        params['cuisine'] = cuisine
    if food_type and food_type != 'any':
         # Map frontend terms to Spoonacular diet terms if necessary
        diet_map = {'vegetarian': 'vegetarian', 'vegan': 'vegan'}
        if food_type in diet_map:
            params['diet'] = diet_map[food_type]

    print(f"Calling Spoonacular findByIngredients with params: {params}")
    try:
        response = _make_request_with_retry("GET", base_url, params=params)
        return {"data": response.json(), "error": None}
    except requests.exceptions.RequestException as e:
        status_code = getattr(e.response, 'status_code', 500) if hasattr(e, 'response') else 500
        error_detail = f"Status {status_code}: {e}"
        if status_code == 401 or status_code == 403:
             error_detail = "Authentication failed (Invalid API Key?)"
        elif status_code == 429:
             error_detail = "API rate limit exceeded"
        print(f"Spoonacular findByIngredients error: {error_detail}")
        return {"data": None, "error": get_error_message("SPOONACULAR_ERROR", error_detail)}
    except Exception as e:
        print(f"Unexpected error fetching Spoonacular recipes: {e}")
        return {"data": None, "error": get_error_message("GENERAL_ERROR", str(e))}


def fetch_spoonacular_details(recipe_id: int) -> Dict[str, Any]:
    """Fetches detailed information for a specific recipe ID."""
    api_key = get_api_key('spoonacular')
    if not api_key:
        return {"data": None, "error": get_error_message("MISSING_API_KEY", "Spoonacular")}

    url = f"https://api.spoonacular.com/recipes/{recipe_id}/information"
    params = {"includeNutrition": "false", "apiKey": api_key}

    print(f"Calling Spoonacular getInformation for ID: {recipe_id}")
    try:
        response = _make_request_with_retry("GET", url, params=params)
        # Parse ingredients using Pydantic model for validation (optional but good)
        recipe_data = response.json()
        if 'extendedIngredients' in recipe_data:
            try:
                 recipe_data['extendedIngredients'] = [
                     SpoonacularIngredient(**ing) for ing in recipe_data.get('extendedIngredients', [])
                 ]
            except Exception as pydantic_error:
                 print(f"Warning: Pydantic validation failed for ingredients: {pydantic_error}")
                 # Decide how to handle - ignore validation? return error?
                 # For now, just proceed with raw data if validation fails

        return {"data": recipe_data, "error": None}
    except requests.exceptions.RequestException as e:
        status_code = getattr(e.response, 'status_code', 500) if hasattr(e, 'response') else 500
        error_detail = f"Status {status_code}: {e}"
        if status_code == 401 or status_code == 403:
            error_detail = "Authentication failed (Invalid API Key?)"
        elif status_code == 404:
             error_detail = f"Recipe ID {recipe_id} not found"
        elif status_code == 429:
             error_detail = "API rate limit exceeded"
        print(f"Spoonacular getInformation error: {error_detail}")
        return {"data": None, "error": get_error_message("SPOONACULAR_ERROR", error_detail)}
    except Exception as e:
        print(f"Unexpected error fetching Spoonacular details: {e}")
        return {"data": None, "error": get_error_message("GENERAL_ERROR", str(e))}

# --- Telegram Action ---
def send_telegram_message(chat_id: str, text: str) -> Dict[str, Any]:
    """Sends a message via the Telegram Bot API."""
    api_key = get_api_key('telegram_bot')
    if not api_key:
        return {"success": False, "message": get_error_message("MISSING_API_KEY", "Telegram Bot")}

    url = f"https://api.telegram.org/bot{api_key}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    headers = {'Content-Type': 'application/json'}

    print(f"Sending Telegram message to chat ID: {chat_id}")
    try:
        response = _make_request_with_retry("POST", url, json=payload, headers=headers)
        response_data = response.json()
        if response_data.get("ok"):
            return {"success": True, "message": "Shopping list sent successfully via Telegram!"}
        else:
            # Try to get more specific error
            error_desc = response_data.get("description", "Unknown Telegram error")
            error_code = response_data.get("error_code")
            specific_error = error_desc
            if error_code == 400 and 'chat not found' in error_desc:
                 specific_error = f"Chat ID '{chat_id}' not found or invalid."
            elif error_code == 403 and 'bot was blocked' in error_desc:
                 specific_error = "Bot was blocked by the user."
            print(f"Telegram API error: {specific_error}")
            return {"success": False, "message": get_error_message("TELEGRAM_ERROR", specific_error)}
    except requests.exceptions.RequestException as e:
         status_code = getattr(e.response, 'status_code', 500) if hasattr(e, 'response') else 500
         error_detail = f"Status {status_code}: {e}"
         if status_code == 401 or status_code == 403: # 401 Unauthorized likely means bad token
             error_detail = "Authentication failed (Invalid Bot Token?)"
         print(f"Telegram sendMessage error: {error_detail}")
         return {"success": False, "message": get_error_message("TELEGRAM_ERROR", error_detail)}
    except Exception as e:
        print(f"Unexpected error sending Telegram message: {e}")
        return {"success": False, "message": get_error_message("GENERAL_ERROR", str(e))}


# --- SendGrid Action ---
def send_sendgrid_email(to_email: str, subject: str, body: str) -> Dict[str, Any]:
    """Sends an email using the SendGrid API."""
    api_key = get_api_key('sendgrid')
    sender_email = get_api_key('sendgrid_sender') # Get configured sender

    if not api_key:
        return {"success": False, "message": get_error_message("MISSING_API_KEY", "SendGrid")}
    if not sender_email:
         return {"success": False, "message": "SendGrid sender email not configured in backend environment."}


    url = "https://api.sendgrid.com/v3/mail/send"
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": sender_email, "name": "Recipe Suggester Extension"},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}]
    }
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    print(f"Sending SendGrid email to: {to_email}")
    try:
        # SendGrid expects 202 Accepted for success
        response = _make_request_with_retry("POST", url, json=payload, headers=headers)
        # Manually check status code here as _make_request_with_retry checks >= 400
        if response.status_code == 202:
             return {"success": True, "message": "Shopping list sent successfully via Email!"}
        else:
             # Try to parse error details if not 202
             error_detail = f"SendGrid returned status {response.status_code}"
             try:
                  error_data = response.json()
                  if error_data.get("errors"):
                       messages = [e.get('message', '') for e in error_data['errors']]
                       error_detail = f"SendGrid Error(s): {'; '.join(messages)}"
                       # Check for specific common errors
                       if any('valid email address' in msg for msg in messages):
                            error_detail = f"Invalid recipient email format '{to_email}'."
                       elif any('permission' in msg or 'authenticate' in msg or 'verified sender' in msg for msg in messages):
                            error_detail = f"Sender email '{sender_email}' might not be verified or have sending permissions in SendGrid."
             except Exception:
                  pass # Keep the basic status code error
             print(f"SendGrid API error: {error_detail}")
             return {"success": False, "message": get_error_message("SENDGRID_ERROR", error_detail)}

    except requests.exceptions.RequestException as e:
        status_code = getattr(e.response, 'status_code', 500) if hasattr(e, 'response') else 500
        error_detail = f"Status {status_code}: {e}"
        if status_code == 401 or status_code == 403:
             error_detail = "Authentication failed (Invalid API Key or Permissions?)"
        print(f"SendGrid send error: {error_detail}")
        return {"success": False, "message": get_error_message("SENDGRID_ERROR", error_detail)}
    except Exception as e:
        print(f"Unexpected error sending SendGrid email: {e}")
        return {"success": False, "message": get_error_message("GENERAL_ERROR", str(e))}

# --- Fallback Action ---
def generate_fallback_ingredients(recipe_title: str) -> List[IngredientDetail]:
    """Generates a fallback list of estimated ingredients based on title."""
    print(f"Generating fallback ingredients for title: '{recipe_title}'")
    title = recipe_title.lower() if recipe_title else ""
    fallback_ingredients = [
        IngredientDetail(name="(Estimate) Salt", amount=1, unit="tsp", is_estimate=True),
        IngredientDetail(name="(Estimate) Pepper", amount=0.5, unit="tsp", is_estimate=True),
        IngredientDetail(name="(Estimate) Cooking Oil", amount=1, unit="tbsp", is_estimate=True)
    ]

    # Basic keyword matching (can be expanded)
    if "pasta" in title or "spaghetti" in title or "lasagna" in title or "macaroni" in title:
        fallback_ingredients.extend([
            IngredientDetail(name="(Estimate) Pasta", amount=8, unit="oz", is_estimate=True),
            IngredientDetail(name="(Estimate) Tomato Sauce", amount=1, unit="can", is_estimate=True)
        ])
    elif "chicken" in title:
        fallback_ingredients.append(IngredientDetail(name="(Estimate) Chicken", amount=1, unit="lb", is_estimate=True))
    elif "salad" in title:
         fallback_ingredients.extend([
            IngredientDetail(name="(Estimate) Lettuce", amount=1, unit="head", is_estimate=True),
            IngredientDetail(name="(Estimate) Vinaigrette", amount=2, unit="tbsp", is_estimate=True)
        ])
    elif "soup" in title:
        fallback_ingredients.append(IngredientDetail(name="(Estimate) Broth", amount=4, unit="cups", is_estimate=True))

    return fallback_ingredients