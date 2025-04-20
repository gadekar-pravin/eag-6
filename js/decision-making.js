/**
 * Decision Making Module
 * Orchestrates the workflow logic, coordinating calls to Perception, Action, and Memory.
 */

import * as memory from './memory.js';
import * as perception from './perception.js';
import * as action from './action.js';

/**
 * Handles the logic after user inputs ingredients/prefs and clicks 'Find Recipes'.
 * @param {object} inputData - { ingredients: string, foodType: string, cuisine: string }
 */
export async function handleIngredientInput(inputData) {
    const { ingredients, foodType, cuisine } = inputData;

    // --- Input Validation ---
    if (!action.ingredientsAreValid(ingredients)) {
        action.showMessage(memory.ERROR_MESSAGES.INVALID_INGREDIENTS, true);
        return;
    }
     // Store preferences early
     memory.updateConversationHistory({ userPreferences: { foodType, cuisine } });


    // --- Start Step 1 ---
    action.showLoading('step1');
    action.hideMessage(); // Clear previous messages

    const spoonacularKey = memory.getApiKey('spoonacularKey');
    const geminiKey = memory.getApiKey('geminiKey');

    if (!spoonacularKey) {
        action.showMessage(memory.ERROR_MESSAGES.NO_API_KEY('Spoonacular'), true);
        action.hideLoading('step1');
        return;
    }
     // Gemini key checked within perception module, will use fallback if missing.

    // --- Construct Query 1 ---
    let preferenceText = '';
    if (foodType && foodType !== 'any') preferenceText += ` I prefer ${foodType} food.`;
    if (cuisine && cuisine !== 'any') preferenceText += ` I'm interested in ${cuisine} cuisine.`;
    const query1 = `I have ${ingredients}.${preferenceText} What recipes can I make considering these preferences?`;
    memory.updateConversationHistory({ query1: query1, retryCount1: 0 }); // Reset retry count for this stage

    // --- Call Perception (LLM) ---
    const llmResult = await perception.runLLMAnalysis(
        query1,
        1, // Stage 1
        geminiKey,
        memory.getHistoryField('retryCount1') // Get initial retry count (should be 0)
    );

    // Update history with LLM results
    memory.updateConversationHistory({
        llmResponse1: llmResult.responseText,
        selfCheck1: llmResult.metadata.selfCheck,
        reasoningTypes1: llmResult.metadata.reasoningTypes,
        uncertainty1: llmResult.metadata.uncertainties,
        error1: llmResult.metadata.errors || llmResult.error, // Include call error if fallback occurred
        retryCount1: llmResult.finalRetryCount
    });

    // Check for blocking errors identified by LLM
    if (memory.getHistoryField('error1')?.toLowerCase().includes('invalid ingredients') ||
        memory.getHistoryField('error1')?.toLowerCase().includes('ambiguous preferences')) {
        action.showMessage(`AI flagged issue: ${memory.getHistoryField('error1')}. Please check input.`, true);
        action.hideLoading('step1');
        return; // Stop processing
    }
    // Show non-blocking AI warnings/uncertainties
    if (memory.getHistoryField('error1') && !memory.getHistoryField('error1')?.toLowerCase().includes('invalid ingredients') && !memory.getHistoryField('error1')?.toLowerCase().includes('ambiguous preferences')) {
         action.showMessage(`AI Note: ${memory.getHistoryField('error1')}`, false, false);
    }
     if (memory.getHistoryField('uncertainty1')) {
          console.log(`AI Uncertainties (Stage 1): ${memory.getHistoryField('uncertainty1')}`);
          // Optionally show: action.showMessage(`AI Uncertainty: ${memory.getHistoryField('uncertainty1')}`, false, false);
     }


    // --- Call Action (Fetch Recipes API) ---
    memory.updateConversationHistory({ toolCall1: `Calling Spoonacular API (findByIngredients) with: ${ingredients} & Prefs: ${foodType}/${cuisine}` });
    const apiResult = await action.fetchRecipes(ingredients, { foodType, cuisine }, spoonacularKey);

    // Update history with API results
    memory.updateConversationHistory({ toolResult1: apiResult.error ? `Error: ${apiResult.error}` : JSON.stringify(apiResult.data) });

    // --- Handle API Response ---
    if (apiResult.error) {
        action.showMessage(apiResult.error, true); // Show API error
    } else {
        if (!apiResult.data || apiResult.data.length === 0) {
             action.showMessage(memory.ERROR_MESSAGES.NO_RECIPES_FOUND, false, false); // Non-blocking info
        }
        // Display recipes (handles empty list UI)
        action.displayRecipes(apiResult.data, handleRecipeSelection); // Pass callback
        action.updateUIForStep(2); // Move to step 2
    }

    // --- Finish Step 1 ---
    action.hideLoading('step1');
}

/**
 * Handles the logic after user selects a recipe.
 * This function is intended to be passed as a callback to action.displayRecipes.
 * @param {number} recipeId The ID of the selected recipe.
 * @param {string} recipeTitle The title of the selected recipe.
 */
export async function handleRecipeSelection(recipeId, recipeTitle) {
    if (!recipeId || !recipeTitle) {
        action.showMessage(memory.ERROR_MESSAGES.INVALID_RECIPE_SELECTION, true);
        return;
    }

    memory.setSelectedRecipe({ id: recipeId, title: recipeTitle });
    const selectedRecipe = memory.getSelectedRecipe(); // Get the stored copy
    console.log("Recipe selected:", selectedRecipe);

    // --- Start Step 2 ---
    action.showLoading('step2');
    action.hideMessage();
    action.displayMissingIngredients([], false); // Clear previous ingredients display

    const spoonacularKey = memory.getApiKey('spoonacularKey');
    const geminiKey = memory.getApiKey('geminiKey');

    if (!spoonacularKey) {
        action.showMessage(memory.ERROR_MESSAGES.NO_API_KEY('Spoonacular'), true);
        action.hideLoading('step2');
        return;
    }

    // --- Construct Query 2 ---
    const history = memory.getHistoryField(); // Get full history copy
    // Summarize long fields for context
    const summarizedResult1 = (history.toolResult1 || '').length > 200 ? (history.toolResult1 || '').substring(0, 200) + '...' : (history.toolResult1 || '');
    const summarizedLLM1 = (history.llmResponse1 || '').substring(0, 150) + '...';

    const query2 = `Previous context:\nQuery1: ${history.query1}\nLLM1: ${summarizedLLM1}\nTool1: ${summarizedResult1}\nPrefs: ${history.userPreferences.foodType}/${history.userPreferences.cuisine}\n\nCurrent Action: User selected recipe: ${recipeTitle} (ID: ${recipeId}). Determine missing ingredients based on user's initial ingredients.`;
    memory.updateConversationHistory({ query2: query2, retryCount2: 0 }); // Reset retry count

    // --- Call Perception (LLM) ---
    const llmResult = await perception.runLLMAnalysis(
        query2,
        2, // Stage 2
        geminiKey,
        memory.getHistoryField('retryCount2')
    );

    // Update history with LLM results
    memory.updateConversationHistory({
        llmResponse2: llmResult.responseText,
        selfCheck2: llmResult.metadata.selfCheck,
        reasoningTypes2: llmResult.metadata.reasoningTypes,
        uncertainty2: llmResult.metadata.uncertainties,
        error2: llmResult.metadata.errors || llmResult.error,
        retryCount2: llmResult.finalRetryCount
    });

    // Check for blocking errors identified by LLM
    if (memory.getHistoryField('error2')?.toLowerCase().includes('invalid recipe id') ||
        memory.getHistoryField('error2')?.toLowerCase().includes('user ingredients list missing')) {
        action.showMessage(`AI flagged issue: ${memory.getHistoryField('error2')}. Please go back.`, true);
        action.hideLoading('step2');
        return; // Stop processing
    }
     // Show non-blocking AI warnings/uncertainties
     if (memory.getHistoryField('error2') && !memory.getHistoryField('error2')?.toLowerCase().includes('invalid recipe id') && !memory.getHistoryField('error2')?.toLowerCase().includes('user ingredients list missing')) {
         action.showMessage(`AI Note: ${memory.getHistoryField('error2')}`, false, false);
    }
    if (memory.getHistoryField('uncertainty2')) {
         console.log(`AI Uncertainties (Stage 2): ${memory.getHistoryField('uncertainty2')}`);
         // Optionally show: action.showMessage(`AI Uncertainty: ${memory.getHistoryField('uncertainty2')}`, false, false);
    }


    // --- Call Action (Fetch Recipe Details API) ---
    memory.updateConversationHistory({ toolCall2: `Calling Spoonacular API (getRecipeInformation) for ID: ${recipeId}` });
    const apiResult = await action.fetchRecipeDetails(recipeId, spoonacularKey);

    // --- Process API Result (Calculate Missing Ingredients) ---
    let missingIngredients = [];
    let isEstimate = false;
    let toolResult2Content = `Error: ${apiResult.error || 'Unknown error fetching details'}`;

    if (!apiResult.error && apiResult.data) {
        const recipeInfo = apiResult.data;
        toolResult2Content = JSON.stringify(recipeInfo); // Store full details

        if (!recipeInfo.extendedIngredients || !Array.isArray(recipeInfo.extendedIngredients)) {
            console.warn(`Recipe info ID ${recipeId} lacks 'extendedIngredients'. Using fallback ingredients.`);
            missingIngredients = action.generateFallbackIngredients(recipeInfo.title || recipeTitle);
            isEstimate = true;
            action.showMessage("Could not get exact ingredients, using estimate.", false, false);
        } else {
            const requiredIngredients = recipeInfo.extendedIngredients;
            const userIngredients = memory.getUserIngredientsFromHistory(); // Get user ingredients from memory

            // Simple matching logic (can be improved)
            missingIngredients = requiredIngredients.filter(reqIng => {
                if (!reqIng || typeof reqIng.name !== 'string' || !reqIng.name.trim()) return false;
                const reqNameLower = reqIng.name.toLowerCase().trim();
                if (!reqNameLower) return false;
                return !userIngredients.some(userIng => {
                     const userIngLower = userIng.toLowerCase().trim();
                     if (!userIngLower) return false;
                      if (reqNameLower.includes(userIngLower) || userIngLower.includes(reqNameLower)) return true;
                      if (reqNameLower.endsWith('s') && userIngLower === reqNameLower.slice(0, -1)) return true;
                      if (userIngLower.endsWith('s') && reqNameLower === userIngLower.slice(0, -1)) return true;
                     const reqWords = reqNameLower.split(' ').filter(w => w.length > 2);
                     const userWords = userIngLower.split(' ').filter(w => w.length > 2);
                      if (reqWords.length > 0 && userWords.length > 0 && reqWords.some(rw => userWords.includes(rw))) return true;
                     return false;
                 });
            }).map(ing => ({
                id: ing.id || 0,
                name: ing.name || 'unknown ingredient',
                amount: ing.amount !== undefined ? ing.amount : 1,
                unit: ing.unit || ''
            }));

            console.log(`Found ${missingIngredients.length} missing ingredients for recipe ID ${recipeId}.`);
        }
        memory.setMissingIngredients(missingIngredients); // Update state
    } else {
        // API error occurred fetching details
        action.showMessage(apiResult.error || 'Failed to get recipe details.', true);
        // Optionally generate fallback ingredients even on error?
        missingIngredients = action.generateFallbackIngredients(recipeTitle);
        isEstimate = true;
        memory.setMissingIngredients(missingIngredients);
        action.showMessage("Could not get exact ingredients due to error, using estimate.", true, false); // Make error more prominent
    }

    memory.updateConversationHistory({ toolResult2: toolResult2Content });

    // --- Display Missing Ingredients and Move to Step 3 ---
    action.displayMissingIngredients(missingIngredients, isEstimate);
    if (!apiResult.error) { // Only move to step 3 if API call didn't fail critically initially
         action.updateUIForStep(3);
    }

    // --- Finish Step 2 ---
    action.hideLoading('step2');
}

/**
 * Handles the logic after user confirms delivery details and clicks 'Send List'.
 * @param {object} requestData - { deliveryMethod: string, deliveryDetails: string }
 */
export async function handleSendListRequest(requestData) {
    const { deliveryMethod, deliveryDetails } = requestData;
    const selectedRecipe = memory.getSelectedRecipe();
    const missingIngredients = memory.getMissingIngredients();

    // --- Input Validation ---
    let validationError = null;
    if (!deliveryDetails) {
        validationError = `Missing ${deliveryMethod === 'telegram' ? 'Telegram Chat ID' : 'Email Address'}`;
    } else if (deliveryMethod === 'telegram' && !/^-?\d+$/.test(deliveryDetails)) {
        validationError = 'Telegram Chat ID must be numeric';
    } else if (deliveryMethod === 'email' && !action.validateEmail(deliveryDetails)) {
        validationError = 'Invalid email address format';
    }

    if (validationError) {
        action.showMessage(memory.ERROR_MESSAGES.INVALID_DELIVERY_DETAILS(validationError), true);
        return;
    }

    if (!selectedRecipe) {
        action.showMessage("Error: No recipe selected. Please go back.", true);
        return;
    }

    // --- Start Step 3 ---
    action.showLoading('step3');
    action.hideMessage();

    const geminiKey = memory.getApiKey('geminiKey');
    const sendKey = memory.getApiKey(deliveryMethod === 'telegram' ? 'telegramBotKey' : 'sendgridKey');

    if (!sendKey) {
        action.showMessage(memory.ERROR_MESSAGES.NO_API_KEY(deliveryMethod === 'telegram' ? 'Telegram Bot' : 'SendGrid'), true);
        action.hideLoading('step3');
        return;
    }

    // --- Construct Query 3 ---
    const history = memory.getHistoryField();
    const summarizedResult1 = (history.toolResult1 || '').length > 200 ? (history.toolResult1 || '').substring(0, 200) + '...' : (history.toolResult1 || '');
    const summarizedResult2 = (history.toolResult2 || '').length > 200 ? (history.toolResult2 || '').substring(0, 200) + '...' : (history.toolResult2 || '');
    const summarizedLLM1 = (history.llmResponse1 || '').substring(0, 100) + '...';
    const summarizedLLM2 = (history.llmResponse2 || '').substring(0, 100) + '...';

    const query3 = `Previous context:\nQuery1: ${history.query1}\nLLM1: ${summarizedLLM1}\nTool1: ${summarizedResult1}\nQuery2: User selected ${selectedRecipe.title}\nLLM2: ${summarizedLLM2}\nTool2 (Missing Ingredients): ${summarizedResult2}\nPrefs: ${history.userPreferences.foodType}/${history.userPreferences.cuisine}\n\nCurrent Action: Send the missing ingredients list for ${selectedRecipe.title} via ${deliveryMethod} to ${deliveryDetails}.`;
    memory.updateConversationHistory({ query3: query3, retryCount3: 0 });

    // --- Call Perception (LLM) ---
    const llmResult = await perception.runLLMAnalysis(
        query3,
        3, // Stage 3
        geminiKey,
        memory.getHistoryField('retryCount3')
    );

    // Update history with LLM results
    memory.updateConversationHistory({
        llmResponse3: llmResult.responseText,
        selfCheck3: llmResult.metadata.selfCheck,
        reasoningTypes3: llmResult.metadata.reasoningTypes,
        uncertainty3: llmResult.metadata.uncertainties,
        error3: llmResult.metadata.errors || llmResult.error,
        retryCount3: llmResult.finalRetryCount
    });

     // Check for blocking errors identified by LLM
     if (memory.getHistoryField('error3')?.toLowerCase().includes('invalid delivery details')) {
        action.showMessage(`AI flagged issue: ${memory.getHistoryField('error3')}. Please check details.`, true);
        action.hideLoading('step3');
        return; // Stop processing
    }
     // Show non-blocking AI warnings/uncertainties
     if (memory.getHistoryField('error3') && !memory.getHistoryField('error3')?.toLowerCase().includes('invalid delivery details')) {
         action.showMessage(`AI Note: ${memory.getHistoryField('error3')}`, false, false);
    }
    if (memory.getHistoryField('uncertainty3')) {
         console.log(`AI Uncertainties (Stage 3): ${memory.getHistoryField('uncertainty3')}`);
    }

    // --- Call Action (Send List API) ---
    memory.updateConversationHistory({ toolCall3: `Calling ${deliveryMethod === 'telegram' ? 'Telegram API' : 'SendGrid API'} to send list for "${selectedRecipe.title}" to ${deliveryDetails}` });
    const sendResult = await action.sendList(deliveryMethod, deliveryDetails, selectedRecipe.title, missingIngredients, sendKey);

    // Update history with API result
    const finalResultText = sendResult.error ? `Failed: ${sendResult.error}` : sendResult.successMessage;
    memory.updateConversationHistory({
        toolResult3: finalResultText,
        finalResult: finalResultText
    });

    // --- Handle API Response ---
    if (sendResult.error) {
        action.showMessage(sendResult.error, true);
    } else {
        action.displayConfirmation(sendResult.successMessage);
        action.updateUIForStep(4); // Move to confirmation step
    }

    // --- Finish Step 3 ---
    action.hideLoading('step3');
}

/**
 * Handles the 'Start Over' action.
 */
export function handleStartOver() {
    memory.resetConversationHistory();
    action.resetUI();
}

/**
 * Handles saving the configuration.
 * @param {object} configData - { spoonacularKey, telegramBotKey, sendgridKey, geminiKey }
 */
export async function handleSaveConfig(configData) {
    try {
        // Trim keys before saving
        const trimmedData = Object.fromEntries(
             Object.entries(configData).map(([key, value]) => [key, value.trim()])
        );
        await memory.updateAndSaveApiKeys(trimmedData);
        action.toggleConfigPanel(false); // Hide panel on success
        action.showMessage('Configuration saved successfully!', false, false); // Non-blocking success
    } catch (error) {
        console.error("Error saving config:", error);
        action.showMessage("Error saving configuration.", true); // Blocking error
    }
}