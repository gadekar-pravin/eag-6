/**
 * Action Module
 * Handles interactions with the "outside world": DOM/UI and external APIs.
 */

import { getMaxApiRetries, ERROR_MESSAGES } from './memory.js';

// Store references to DOM elements
let uiElements = {};

/**
 * Gets and stores references to essential UI elements.
 * Should be called once after DOMContentLoaded.
 */
function cacheDOMElements() {
    uiElements = {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        step4: document.getElementById('step4'),
        ingredientsInput: document.getElementById('ingredients'),
        // ** START: Ensure new elements are cached **
        foodTypePrefElement: document.getElementById('foodTypePreference'),
        cuisinePrefElement: document.getElementById('cuisinePreference'),
        // ** END: Ensure new elements are cached **
        findRecipesBtn: document.getElementById('findRecipes'),
        recipeResultsContainer: document.getElementById('recipeResults'),
        missingIngredientsContainer: document.getElementById('missingIngredients'),
        sendListBtn: document.getElementById('sendList'),
        startOverBtn: document.getElementById('startOver'),
        backToStep1Btn: document.getElementById('backToStep1'),
        backToStep2Btn: document.getElementById('backToStep2'),
        configButton: document.getElementById('configButton'),
        configPanel: document.getElementById('configPanel'),
        saveConfigBtn: document.getElementById('saveConfig'),
        errorDisplay: document.getElementById('error'),
        loading1: document.getElementById('loading1'),
        loading2: document.getElementById('loading2'),
        loading3: document.getElementById('loading3'),
        confirmationMessage: document.getElementById('confirmationMessage'),
        spoonacularKeyInput: document.getElementById('spoonacularKey'),
        telegramBotKeyInput: document.getElementById('telegramBotKey'),
        sendgridKeyInput: document.getElementById('sendgridKey'),
        geminiKeyInput: document.getElementById('geminiKey'),
        telegramRadio: document.getElementById('telegram'),
        emailRadio: document.getElementById('email'),
        telegramOptions: document.getElementById('telegramOptions'),
        emailOptions: document.getElementById('emailOptions'),
        telegramChatIdInput: document.getElementById('telegramChatId'),
        emailAddressInput: document.getElementById('emailAddress'),
    };
}

// --- DOM Access ---

/**
 * Returns the cached object containing references to key UI elements.
 * Ensures elements are cached first.
 * @returns {object} References to UI elements.
 */
export function getDOMElements() {
    if (Object.keys(uiElements).length === 0) {
        cacheDOMElements();
    }
    return uiElements;
}

// --- External API Calls ---

/**
 * Fetches recipes from Spoonacular based on ingredients and preferences.
 * Handles retries.
 * @param {string} ingredients Comma-separated string of ingredients.
 * @param {{foodType: string, cuisine: string}} preferences User preferences.
 * @param {string} apiKey Spoonacular API key.
 * @param {number} retryCount Current retry attempt.
 * @returns {Promise<{data: any, error: string|null}>} Result object.
 */
export async function fetchRecipes(ingredients, preferences, apiKey, retryCount = 0) {
    const MAX_RETRIES = getMaxApiRetries();
    try {
        if (!ingredients || typeof ingredients !== 'string' || ingredients.trim().length === 0) {
            return { data: null, error: ERROR_MESSAGES.INVALID_INGREDIENTS };
        }
        const ingredientsParam = ingredients.split(',')
            .map(i => i.trim()).filter(i => i.length > 0).join(',');
        if (!ingredientsParam) {
            return { data: null, error: ERROR_MESSAGES.INVALID_INGREDIENTS };
        }

        let url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredientsParam)}&number=5&ranking=1&apiKey=${apiKey}`;

        // Add preferences to query if available and not 'any'
        // ** START: Updated Preference Logic **
        if (preferences.cuisine && preferences.cuisine !== 'any') {
            url += `&cuisine=${encodeURIComponent(preferences.cuisine)}`;
        }
        if (preferences.foodType && preferences.foodType !== 'any') {
            // Map foodType to Spoonacular diet parameter if applicable
            const dietMap = {
                'vegetarian': 'vegetarian',
                'vegan': 'vegan',
                // 'non-vegetarian' or 'any' means no diet filter needed
            };
            if (dietMap[preferences.foodType]) {
                url += `&diet=${dietMap[preferences.foodType]}`;
            }
        }
        // ** END: Updated Preference Logic **


        console.log(`Fetching recipes (API Attempt ${retryCount + 1}/${MAX_RETRIES + 1}) URL: ${url}`);

        const response = await fetch(url);

        if (response.status === 429) { // Rate limit
            if (retryCount < MAX_RETRIES) {
                console.log(`Rate limit (429) hit fetching recipes, retrying...`);
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchRecipes(ingredients, preferences, apiKey, retryCount + 1);
            } else {
                return { data: null, error: ERROR_MESSAGES.API_RATE_LIMIT('Spoonacular') };
            }
        }
        if (response.status === 401 || response.status === 403) {
            return { data: null, error: ERROR_MESSAGES.SPOONACULAR_AUTH_ERROR };
        }
        if (!response.ok) {
            throw new Error(`Spoonacular API error fetching recipes: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data || !Array.isArray(data)) {
            console.warn("Received non-array data from Spoonacular findByIngredients:", data);
            return { data: [], error: null }; // Return empty array for consistency
        }
        return { data: data, error: null };

    } catch (error) {
        console.error("Error in fetchRecipes:", error);
        if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_RETRIES) {
            console.log(`Network error fetching recipes, retrying...`);
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchRecipes(ingredients, preferences, apiKey, retryCount + 1);
        }
        // Let specific errors propagate if known
        if (error.message.includes('rate limit') || error.message.includes('unauthorized')) {
             return { data: null, error: error.message };
        }
        // Return generic error for others
        return { data: null, error: `Failed to fetch recipes: ${error.message || 'Unknown error'}` };
    }
}

/**
 * Fetches detailed information for a specific recipe ID.
 * Handles retries.
 * @param {number} recipeId The ID of the recipe.
 * @param {string} apiKey Spoonacular API key.
 * @param {number} retryCount Current retry attempt.
 * @returns {Promise<{data: any, error: string|null}>} Result object containing recipe details.
 */
export async function fetchRecipeDetails(recipeId, apiKey, retryCount = 0) {
    const MAX_RETRIES = getMaxApiRetries();
    try {
        if (!recipeId || isNaN(parseInt(recipeId))) {
            return { data: null, error: 'Invalid recipe ID provided' };
        }

        const url = `https://api.spoonacular.com/recipes/${recipeId}/information?includeNutrition=false&apiKey=${apiKey}`;
        console.log(`Fetching recipe info ID ${recipeId} (API Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

        const response = await fetch(url);

        if (response.status === 429) { // Rate limit
            if (retryCount < MAX_RETRIES) {
                console.log(`Rate limit (429) hit fetching recipe info, retrying...`);
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchRecipeDetails(recipeId, apiKey, retryCount + 1);
            } else {
                return { data: null, error: ERROR_MESSAGES.API_RATE_LIMIT('Spoonacular') };
            }
        }
        if (response.status === 401 || response.status === 403) {
            return { data: null, error: ERROR_MESSAGES.SPOONACULAR_AUTH_ERROR };
        }
        if (response.status === 404) {
            return { data: null, error: ERROR_MESSAGES.SPOONACULAR_NOT_FOUND(recipeId) };
        }
        if (!response.ok) {
            throw new Error(`API error fetching recipe info: ${response.status} ${response.statusText}`);
        }

        const recipeInfo = await response.json();
        return { data: recipeInfo, error: null };

    } catch (error) {
        console.error("Error in fetchRecipeDetails:", error);
        if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_RETRIES) {
            console.log(`Network error fetching recipe info, retrying...`);
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchRecipeDetails(recipeId, apiKey, retryCount + 1);
        }
         // Let specific errors propagate
         if (error.message.includes('rate limit') || error.message.includes('unauthorized') || error.message.includes('not found')) {
              return { data: null, error: error.message };
         }
         // Return generic error for others
         return { data: null, error: `Failed to fetch recipe details: ${error.message || 'Unknown error'}` };
    }
}

/**
 * Sends the shopping list via Telegram or Email.
 * Handles retries.
 * @param {'telegram' | 'email'} method Delivery method.
 * @param {string} destination Telegram Chat ID or Email address.
 * @param {string} recipeTitle Title of the recipe.
 * @param {Array} ingredients Array of missing ingredient objects.
 * @param {string} apiKey Telegram Bot or SendGrid API key.
 * @param {number} retryCount Current retry attempt.
 * @returns {Promise<{successMessage: string|null, error: string|null}>} Result object.
 */
export async function sendList(method, destination, recipeTitle, ingredients, apiKey, retryCount = 0) {
    const MAX_RETRIES = getMaxApiRetries();
    try {
        // Basic validation done in decision-making, assuming valid inputs here
        recipeTitle = recipeTitle || 'Your Recipe';
        ingredients = Array.isArray(ingredients) ? ingredients : [];

        const shoppingListText = `Shopping List for: ${recipeTitle}\n\n` +
            (ingredients.length > 0
                ? ingredients.map(item => `- ${item?.amount ?? ''} ${item?.unit ?? ''} ${item?.name ?? 'Unknown Item'}`.trim().replace(/ +/g, ' ')).join('\n')
                : '(You seem to have all the ingredients!)');

        console.log(`Sending list via ${method} to ${destination} (API Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

        let response;
        let successMessage = '';
        let specificError = null;

        if (method === 'telegram') {
            const url = `https://api.telegram.org/bot${apiKey}/sendMessage`;
            const payload = { chat_id: destination, text: shoppingListText, parse_mode: 'Markdown' };
            response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            successMessage = 'Shopping list sent successfully via Telegram!';
             // Specific Telegram error handling
             if (!response.ok) {
                  let errorDescription = `Status ${response.status}`;
                  try {
                      const errorData = await response.json();
                      errorDescription = errorData.description || errorDescription;
                      if (errorData.error_code === 400 && errorDescription.includes('chat not found')) specificError = ERROR_MESSAGES.TELEGRAM_CHAT_NOT_FOUND;
                      else if (errorData.error_code === 403 && errorDescription.includes('bot was blocked')) specificError = ERROR_MESSAGES.TELEGRAM_BOT_BLOCKED;
                  } catch (e) {}
                  if (!specificError) specificError = `Telegram API error: ${errorDescription}`;
              }
        } else { // email
            const url = 'https://api.sendgrid.com/v3/mail/send';
            // IMPORTANT: Replace with a verified sender in SendGrid or make it configurable
            const senderEmail = 'recipe-suggester-bot@example.com'; // <<< !!! UPDATE THIS TO YOUR VERIFIED SENDER !!!
            const payload = {
                personalizations: [{ to: [{ email: destination }] }],
                from: { email: senderEmail, name: 'Recipe Suggester' },
                subject: `Shopping List for ${recipeTitle}`,
                content: [{ type: 'text/plain', value: shoppingListText }]
            };
            response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
            successMessage = 'Shopping list sent successfully via Email!';
            // Specific SendGrid error handling (expects 202)
             if (response.status !== 202) {
                  let errorMessage = `SendGrid API error: ${response.status} ${response.statusText}`;
                  try {
                      const errorData = await response.json();
                      if (errorData.errors && errorData.errors.length > 0) {
                          errorMessage = `SendGrid Error(s): ${errorData.errors.map(e => e.message).join('; ')}`;
                           if (errorMessage.includes('valid email address')) specificError = ERROR_MESSAGES.SENDGRID_INVALID_EMAIL;
                           else if (errorMessage.includes('verified sender') || errorMessage.includes('authenticate') || errorMessage.includes('permission')) specificError = ERROR_MESSAGES.SENDGRID_SENDER_ISSUE;
                      }
                  } catch (e) {}
                  if (!specificError) specificError = errorMessage;
              }
        }

        // --- Common Response Handling ---
        if (response.status === 429) { // Rate Limit
            if (retryCount < MAX_RETRIES) {
                console.log(`${method} rate limit (429), retrying...`);
                let delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
                 if (method === 'telegram') {
                      try {
                          const errorData = await response.clone().json();
                          if (errorData.parameters && errorData.parameters.retry_after) {
                              delay = errorData.parameters.retry_after * 1000 + 500;
                              console.log(`Using Telegram retry_after: ${errorData.parameters.retry_after}s`);
                          }
                      } catch (e) {}
                  }
                await new Promise(resolve => setTimeout(resolve, delay));
                return sendList(method, destination, recipeTitle, ingredients, apiKey, retryCount + 1);
            } else {
                 return { successMessage: null, error: ERROR_MESSAGES.API_RATE_LIMIT(method === 'telegram' ? 'Telegram' : 'SendGrid') };
            }
        }

        // Auth Errors
        if (response.status === 401 || response.status === 403) {
            const authError = method === 'telegram' ? ERROR_MESSAGES.TELEGRAM_AUTH_ERROR : ERROR_MESSAGES.SENDGRID_AUTH_ERROR;
            return { successMessage: null, error: authError };
        }

        // Check specific errors identified above
        if (specificError) {
            throw new Error(specificError);
        }

        // Check general response status for non-specific errors
        if (!response.ok && !(method === 'email' && response.status === 202)) {
             throw new Error(`${method} API failed with status: ${response.status} ${response.statusText}`);
        }

        // Success
        console.log(`${method} send successful.`);
        return { successMessage: successMessage, error: null };

    } catch (error) {
        console.error(`Error in sendList (${method}):`, error);
        if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_RETRIES) {
            console.log(`Network error sending ${method}, retrying...`);
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return sendList(method, destination, recipeTitle, ingredients, apiKey, retryCount + 1);
        }
        // Let specific, informative errors propagate
         const knownErrors = [
             ERROR_MESSAGES.API_RATE_LIMIT(''), ERROR_MESSAGES.TELEGRAM_AUTH_ERROR, ERROR_MESSAGES.SENDGRID_AUTH_ERROR,
             ERROR_MESSAGES.TELEGRAM_CHAT_NOT_FOUND, ERROR_MESSAGES.TELEGRAM_BOT_BLOCKED,
             ERROR_MESSAGES.SENDGRID_INVALID_EMAIL, ERROR_MESSAGES.SENDGRID_SENDER_ISSUE
         ];
         if (knownErrors.some(known => error.message.includes(known.substring(0, known.indexOf(':'))))) { // Check prefix
            return { successMessage: null, error: error.message };
         }
        // Throw generic for others
        return { successMessage: null, error: `Failed to send shopping list via ${method}: ${error.message || 'Unknown error'}` };
    }
}


// --- UI Update Functions ---

/**
 * Shows the loading indicator for a specific step.
 * @param {'step1' | 'step2' | 'step3'} stepIndicator
 */
export function showLoading(stepIndicator) {
    const els = getDOMElements();
    if (stepIndicator === 'step1') els.loading1.style.display = 'block';
    else if (stepIndicator === 'step2') els.loading2.style.display = 'block';
    else if (stepIndicator === 'step3') els.loading3.style.display = 'block';
    // Disable relevant button
    if (stepIndicator === 'step1') els.findRecipesBtn.disabled = true;
    if (stepIndicator === 'step3') els.sendListBtn.disabled = true;
}

/**
 * Hides the loading indicator for a specific step.
 * @param {'step1' | 'step2' | 'step3'} stepIndicator
 */
export function hideLoading(stepIndicator) {
    const els = getDOMElements();
    if (stepIndicator === 'step1') els.loading1.style.display = 'none';
    else if (stepIndicator === 'step2') els.loading2.style.display = 'none';
    else if (stepIndicator === 'step3') els.loading3.style.display = 'none';
    // Re-enable relevant button
    if (stepIndicator === 'step1') els.findRecipesBtn.disabled = false;
    if (stepIndicator === 'step3') els.sendListBtn.disabled = false;
}

/**
 * Displays a message (error or success) in the designated area.
 * @param {string} message The message text.
 * @param {boolean} isError True if it's an error, false for success/info.
 * @param {boolean} [isBlocking=true] If true, message persists. If false, hides after timeout.
 */
export function showMessage(message, isError, isBlocking = true) {
    const els = getDOMElements();
    els.errorDisplay.textContent = message;
    els.errorDisplay.className = isError ? 'error-message active error' : 'error-message active success'; // Use classes
    els.errorDisplay.style.display = 'block';


    if (!isBlocking) {
        setTimeout(() => {
            // Only hide if it's still the same message
            if (els.errorDisplay.textContent === message) {
                els.errorDisplay.style.display = 'none';
                els.errorDisplay.textContent = '';
                els.errorDisplay.className = 'error-message'; // Reset class
            }
        }, 5000); // 5 seconds
    }
}

/**
 * Hides the general message display area.
 */
export function hideMessage() {
    const els = getDOMElements();
    els.errorDisplay.style.display = 'none';
    els.errorDisplay.textContent = '';
    els.errorDisplay.className = 'error-message';
}

/**
 * Displays the list of suggested recipes.
 * @param {Array} recipes Array of recipe objects from Spoonacular.
 * @param {function} selectRecipeCallback Function to call when a recipe is clicked (passes id, title).
 */
export function displayRecipes(recipes, selectRecipeCallback) {
    const els = getDOMElements();
    els.recipeResultsContainer.innerHTML = ''; // Clear previous results

    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
        els.recipeResultsContainer.innerHTML = `
            <div class="no-results">
                <p>${ERROR_MESSAGES.NO_RECIPES_FOUND}</p>
                <p>Suggestions:</p>
                <ul>
                    <li>Check ingredient spelling</li>
                    <li>Include basic items (oil, salt, onion)</li>
                    <li>Add a main component (chicken, pasta, beans)</li>
                    <li>Try fewer, more common ingredients</li>
                    <li>Adjust preferences</li>
                </ul>
            </div>`;
        return;
    }

    recipes.forEach(recipe => {
        const title = recipe.title || 'Untitled Recipe';
        const imageUrl = recipe.image || 'images/placeholder-recipe.png'; // Use a local placeholder
        const usedCount = recipe.usedIngredientCount ?? 0;
        const missingCount = recipe.missedIngredientCount ?? 0;
        const recipeId = recipe.id;

        if (!recipeId) {
            console.warn("Recipe found without an ID, skipping display:", recipe);
            return;
        }

        const recipeCard = document.createElement('div');
        recipeCard.className = 'recipe-card';
        recipeCard.setAttribute('data-recipe-id', recipeId);
        recipeCard.innerHTML = `
            <h3>${title}</h3>
            <img src="${imageUrl}" alt="${title}" onerror="this.onerror=null; this.src='images/placeholder-recipe.png';">
            <p>Ingredients You Have: ${usedCount}</p>
            <p>Missing Ingredients: ${missingCount}</p>
        `;

        recipeCard.addEventListener('click', function() {
            document.querySelectorAll('.recipe-card.selected').forEach(card => card.classList.remove('selected'));
            recipeCard.classList.add('selected');
            if (selectRecipeCallback) {
                selectRecipeCallback(recipeId, title); // Pass ID and title
            }
        });

        els.recipeResultsContainer.appendChild(recipeCard);
    });
}

/**
 * Displays the list of missing ingredients.
 * @param {Array} ingredients Array of missing ingredient objects.
 * @param {boolean} isEstimate Indicates if the list is a fallback estimate.
 */
export function displayMissingIngredients(ingredients, isEstimate = false) {
    const els = getDOMElements();
    els.missingIngredientsContainer.innerHTML = ''; // Clear previous

    if (!ingredients || !Array.isArray(ingredients)) {
        console.warn("displayMissingIngredients called with invalid data");
        els.missingIngredientsContainer.innerHTML = "<p class='error-message'>Could not display ingredients.</p>";
        return;
    }

    if (ingredients.length === 0 && !isEstimate) {
        els.missingIngredientsContainer.innerHTML = '<p class="complete-message">Good news! You seem to have all the ingredients needed for this recipe!</p>';
        return;
    }

    let listHtml = "";
    if (isEstimate) {
        listHtml += "<p class='fallback-notice'><strong>Note:</strong> Could not retrieve exact ingredients. This is an estimate:</p>";
    }

    listHtml += "<ul class='ingredients-list'>";
    ingredients.forEach(ingredient => {
        if (!ingredient) return;
        const amount = ingredient.amount ?? '';
        const unit = ingredient.unit || '';
        const name = ingredient.name || 'Unknown Ingredient';
        const text = `${amount} ${unit} ${name}`.trim().replace(/ +/g, ' ');
        listHtml += `<li>${text}</li>`;
    });
    listHtml += "</ul>";

    els.missingIngredientsContainer.innerHTML = listHtml;
}

/**
 * Displays the final confirmation message.
 * @param {string} message The confirmation text.
 */
export function displayConfirmation(message) {
    const els = getDOMElements();
    els.confirmationMessage.textContent = message;
}

/**
 * Shows the specified step div and hides others.
 * @param {number} stepNumber The step number (1, 2, 3, or 4) to display.
 */
export function updateUIForStep(stepNumber) {
    const els = getDOMElements();
    [els.step1, els.step2, els.step3, els.step4].forEach((step, index) => {
        if (index + 1 === stepNumber) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    // Hide error message when changing steps
    hideMessage();
}

/**
 * Resets the entire UI to the initial state (Step 1).
 * Clears inputs, results, hides loaders, errors, and confirmation.
 */
export function resetUI() {
    const els = getDOMElements();

    // Reset inputs
    els.ingredientsInput.value = '';
    // ** START: Reset Preferences **
    if (els.foodTypePrefElement) els.foodTypePrefElement.value = 'any';
    if (els.cuisinePrefElement) els.cuisinePrefElement.value = 'any';
    // ** END: Reset Preferences **
    els.telegramChatIdInput.value = '';
    els.emailAddressInput.value = '';
    els.telegramRadio.checked = true; // Default to Telegram
    els.telegramOptions.style.display = 'block';
    els.emailOptions.style.display = 'none';

    // Clear results
    els.recipeResultsContainer.innerHTML = '';
    els.missingIngredientsContainer.innerHTML = '';
    els.confirmationMessage.textContent = '';

    // Hide loaders and messages
    hideLoading('step1');
    hideLoading('step2');
    hideLoading('step3');
    hideMessage();

    // Ensure buttons are enabled
    els.findRecipesBtn.disabled = false;
    els.sendListBtn.disabled = false;


    // Go to step 1
    updateUIForStep(1);
}

/**
 * Sets the value of a specific input element in the UI.
 * @param {'spoonacularKey' | 'telegramBotKey' | 'sendgridKey' | 'geminiKey'} elementKey Key corresponding to the input field in uiElements.
 * @param {string} value The value to set.
 */
export function setConfigInputValue(elementKey, value) {
     const els = getDOMElements();
     const inputElement = els[elementKey + 'Input']; // e.g., els['spoonacularKeyInput']
     if (inputElement) {
         inputElement.value = value || '';
     } else {
          console.warn(`Config input element not found for key: ${elementKey}`);
     }
}

/**
 * Toggles the visibility of the configuration panel.
 * @param {boolean} show True to show, false to hide.
 */
export function toggleConfigPanel(show) {
    const els = getDOMElements();
    els.configPanel.style.display = show ? 'block' : 'none';
}


/**
 * Validates an email address format.
 * @param {string} email
 * @returns {boolean} True if valid format, false otherwise.
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
}

/**
 * Validates ingredients input format (basic check).
 * @param {string} ingredients
 * @returns {boolean} True if valid format, false otherwise.
 */
export function ingredientsAreValid(ingredients) {
    if (!ingredients || typeof ingredients !== 'string') return false;
    // Check if there's at least one non-empty item after splitting and trimming
    return ingredients.split(',').some(item => item.trim().length > 0);
}

/**
 * Generates fallback ingredients based on recipe title.
 * @param {string} recipeTitle
 * @returns {Array} Array of estimated ingredient objects.
 */
export function generateFallbackIngredients(recipeTitle) {
        console.log(`Generating fallback ingredients for title: "${recipeTitle}"`);
        if (typeof recipeTitle !== 'string') recipeTitle = '';
        const title = recipeTitle.toLowerCase();

        let fallbackIngredients = [
            { id: 0, name: "(Estimate) Salt", amount: 1, unit: "tsp" },
            { id: 0, name: "(Estimate) Pepper", amount: 0.5, unit: "tsp" },
            { id: 0, name: "(Estimate) Cooking Oil", amount: 1, unit: "tbsp" }
        ];

        // Add more sophisticated logic based on title keywords as before...
        if (title.includes("pasta") || title.includes("spaghetti") || title.includes("lasagna") || title.includes("macaroni")) {
            fallbackIngredients.push({ id: 0, name: "(Estimate) Pasta", amount: 8, unit: "oz" }, { id: 0, name: "(Estimate) Tomato Sauce", amount: 1, unit: "can" });
        } else if (title.includes("chicken")) {
             fallbackIngredients.push({ id: 0, name: "(Estimate) Chicken", amount: 1, unit: "lb" });
        } // Add more rules based on the original function

        return fallbackIngredients.map(ing => ({ ...ing, isEstimate: true })); // Mark as estimate
}