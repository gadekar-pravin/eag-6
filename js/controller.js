/**
 * Controller Module (JavaScript Frontend)
 * Orchestrates the frontend workflow logic, interacting with the backend via api.js and updating the view via ui.js.
 */

import * as state from './state.js'; // Renamed from memory
import * as api from './api.js';     // NEW: For backend calls
import * as ui from './ui.js';       // NEW: For DOM manipulation

/**
 * Handles the logic after user inputs ingredients/prefs and clicks 'Find Recipes'.
 * @param {object} inputData - { ingredients: string, foodType: string, cuisine: string }
 */
export async function handleIngredientInput(inputData) {
    const { ingredients, foodType, cuisine } = inputData;

    if (!ui.ingredientsAreValid(ingredients)) {
        ui.showMessage(state.ERROR_MESSAGES.INVALID_INGREDIENTS, true);
        return;
    }
    state.setUserIngredients(ingredients);
    state.setUserPreferences({ foodType, cuisine });
    state.logSimpleEvent(`User input ingredients and preferences.`);

    ui.showLoading('step1');
    ui.hideMessage();

    const backendResult = await api.fetchRecipesFromBackend(ingredients, { foodType, cuisine });

    // Log LLM prompt and metadata
    if (backendResult.llm_prompt) {
        state.logLLMPrompt(1, backendResult.llm_prompt);
        state.updateState({ lastLLMPromptMetadata: backendResult.metadata || {} });
    }

    if (backendResult.error) {
        const displayError = backendResult.error.includes('Cannot connect')
            ? state.ERROR_MESSAGES.BACKEND_UNREACHABLE
            : state.ERROR_MESSAGES.BACKEND_ERROR(backendResult.error);
        ui.showMessage(displayError, true);
        state.logSimpleEvent(`Error fetching recipes: ${backendResult.error}`);
    } else {
        if (!backendResult.data || backendResult.data.length === 0) {
            ui.showMessage(state.ERROR_MESSAGES.NO_RECIPES_FOUND, false, false);
            state.logSimpleEvent(`No recipes found for input.`);
        } else {
            state.logSimpleEvent(`Found ${backendResult.data.length} recipes.`);
        }
        ui.displayRecipes(backendResult.data, handleRecipeSelection);
        ui.updateUIForStep(2);
    }

    ui.hideLoading('step1');
}

/**
 * Handles the logic after user selects a recipe.
 * @param {number} recipeId - The ID of the selected recipe.
 * @param {string} recipeTitle - The title of the selected recipe.
 */
export async function handleRecipeSelection(recipeId, recipeTitle) {
    if (!recipeId || !recipeTitle) {
        ui.showMessage(state.ERROR_MESSAGES.INVALID_RECIPE_SELECTION, true);
        return;
    }

    // Store selection in frontend state
    state.setSelectedRecipe({ id: recipeId, title: recipeTitle });
    const userIngredients = state.getUserIngredientsList(); // Get user ingredients stored earlier
    state.logSimpleEvent(`User selected recipe: "${recipeTitle}" (ID: ${recipeId}).`);

    // --- Start Step 2 (using UI module) ---
    ui.showLoading('step2');
    ui.hideMessage();
    ui.displayMissingIngredients([], false); // Clear previous display (using UI module)

    // --- Call API (Fetch Missing Ingredients from Backend) ---
    const backendResult = await api.fetchMissingIngredientsFromBackend(recipeId, recipeTitle, userIngredients);

    // --- Log LLM prompt if available ---
    if (backendResult.llm_prompt) {
        state.logLLMPrompt(2, backendResult.llm_prompt);
    }

    // --- Handle API Response ---
    if (backendResult.error) {
         const displayError = backendResult.error.includes('Cannot connect')
            ? state.ERROR_MESSAGES.BACKEND_UNREACHABLE
            : state.ERROR_MESSAGES.BACKEND_ERROR(backendResult.error);
        ui.showMessage(displayError, true);
        // Don't proceed to step 3 if backend failed critically
        state.setMissingIngredients([]); // Clear any potentially stale list in state
        state.logSimpleEvent(`Error getting missing ingredients: ${backendResult.error}`);
    } else {
        state.setMissingIngredients(backendResult.missingIngredients || []); // Update state
        ui.displayMissingIngredients(backendResult.missingIngredients || [], backendResult.isEstimate); // Use UI module
        ui.updateUIForStep(3); // Move to step 3 (using UI module)
        state.logSimpleEvent(`Calculated ${backendResult.missingIngredients?.length ?? 0} missing ingredients (Estimate: ${backendResult.isEstimate}).`);
    }

    // --- Finish Step 2 (using UI module) ---
    ui.hideLoading('step2');
}

/**
 * Handles the logic after user confirms delivery details and clicks 'Send List'.
 * @param {object} requestData - { deliveryMethod: string, deliveryDetails: string }
 */
export async function handleSendListRequest(requestData) {
    const { deliveryMethod, deliveryDetails } = requestData;
    const selectedRecipe = state.getSelectedRecipe();
    const missingIngredients = state.getMissingIngredients(); // Get from frontend state

    // --- Input Validation (Frontend - using UI module) ---
    let validationError = null;
    if (!deliveryDetails) {
        validationError = `Missing ${deliveryMethod === 'telegram' ? 'Telegram Chat ID' : 'Email Address'}`;
    } else if (deliveryMethod === 'telegram' && !/^-?\d+$/.test(deliveryDetails)) {
        validationError = 'Telegram Chat ID must be numeric';
    } else if (deliveryMethod === 'email' && !ui.validateEmail(deliveryDetails)) { // Use UI validation
        validationError = 'Invalid email address format';
    }

    if (validationError) {
        ui.showMessage(state.ERROR_MESSAGES.INVALID_DELIVERY_DETAILS(validationError), true);
        return;
    }

    if (!selectedRecipe) {
        ui.showMessage("Error: No recipe selected. Please go back.", true);
        return;
    }

    // --- Start Step 3 (using UI module) ---
    ui.showLoading('step3');
    ui.hideMessage();
    state.logSimpleEvent(`Attempting to send list for "${selectedRecipe.title}" via ${deliveryMethod}.`);

    // --- Call API (Send List via Backend) ---
    const backendResult = await api.sendListToBackend(
        deliveryMethod,
        deliveryDetails,
        selectedRecipe.title,
        missingIngredients // Pass the list obtained from state
    );

    // --- Log LLM prompt if available ---
    if (backendResult.llm_prompt) {
        state.logLLMPrompt(3, backendResult.llm_prompt);
    }

    // --- Handle API Response ---
    if (backendResult.error) {
        const displayError = backendResult.error.includes('Cannot connect')
            ? state.ERROR_MESSAGES.BACKEND_UNREACHABLE
            : state.ERROR_MESSAGES.BACKEND_ERROR(backendResult.error);
        ui.showMessage(displayError, true); // Show error in the main area (using UI module)
        state.logSimpleEvent(`Error sending list: ${backendResult.error}`);
    } else {
        // Display confirmation message in Step 4 area (using UI module)
        ui.displayConfirmation(backendResult.successMessage || 'List sent successfully!', true);
        ui.updateUIForStep(4); // Move to confirmation step (using UI module)
        state.logSimpleEvent(`Shopping list sent successfully.`);
    }

    // --- Finish Step 3 (using UI module) ---
    ui.hideLoading('step3');
}

/**
 * Handles the 'Start Over' action.
 */
export function handleStartOver() {
    state.resetState(); // Reset frontend state
    ui.resetUI();       // Reset UI elements (using UI module)
    state.logSimpleEvent("Started over.");
}