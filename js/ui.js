/**
 * UI Module (JavaScript Frontend)
 * Handles DOM manipulations and UI updates.
 */

/**
 * Gets references to all DOM elements needed by the application.
 * @returns {Object} Object containing references to DOM elements.
 */
export function getDOMElements() {
    return {
        // Step 1 elements
        ingredientsInput: document.getElementById('ingredients-input'),
        foodTypePrefElement: document.getElementById('food-type-pref'),
        cuisinePrefElement: document.getElementById('cuisine-pref'),
        findRecipesBtn: document.getElementById('find-recipes-btn'),

        // Step 2 elements
        recipeResults: document.getElementById('recipe-results'),
        backToStep1Btn: document.getElementById('back-to-step1-btn'),

        // Step 3 elements
        missingIngredientsContainer: document.getElementById('missing-ingredients-container'),
        telegramRadio: document.getElementById('telegram-radio'),
        emailRadio: document.getElementById('email-radio'),
        telegramChatIdInput: document.getElementById('telegram-chat-id'),
        emailAddressInput: document.getElementById('email-address'),
        telegramOptions: document.getElementById('telegram-options'),
        emailOptions: document.getElementById('email-options'),
        sendListBtn: document.getElementById('send-list-btn'),
        backToStep2Btn: document.getElementById('back-to-step2-btn'),

        // Step 4 elements
        confirmationMessage: document.getElementById('confirmation-message'),
        startOverBtn: document.getElementById('start-over-btn'),

        // Common elements
        errorMessage: document.getElementById('error-message'),
        loadingIndicator: document.getElementById('loading-indicator'),
        steps: {
            step1: document.getElementById('step1'),
            step2: document.getElementById('step2'),
            step3: document.getElementById('step3'),
            step4: document.getElementById('step4')
        },

        // Debug panel elements
        debugPanel: document.getElementById('debug-panel'),
        debugLog: document.getElementById('debug-log'),
        debugToggle: document.getElementById('debug-toggle')
    };
}

/**
 * Checks if ingredients input is valid.
 * @param {string} ingredients - The ingredients input string.
 * @returns {boolean} True if ingredients are valid, false otherwise.
 */
export function ingredientsAreValid(ingredients) {
    if (!ingredients || typeof ingredients !== 'string') {
        return false;
    }
    // Trim and check if there's any content after splitting by commas
    const items = ingredients.split(',').map(item => item.trim()).filter(item => item.length > 0);
    return items.length > 0;
}

/**
 * Validates an email address format.
 * @param {string} email - The email address to validate.
 * @returns {boolean} True if email format is valid, false otherwise.
 */
export function validateEmail(email) {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Shows an error or info message.
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether this is an error (true) or info message (false).
 * @param {boolean} isBlocking - Whether this error blocks further progress (default: true).
 */
export function showMessage(message, isError = true, isBlocking = true) {
    const messageElement = document.getElementById('error-message');
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.style.display = 'block';
    messageElement.className = 'error-message active';

    if (isError) {
        messageElement.classList.add('error');
    } else {
        messageElement.classList.add('success');
    }

    // Optional: Handle blocking vs non-blocking errors differently
    if (isBlocking) {
        console.error(message);
    } else {
        console.warn(message);
    }
}

/**
 * Hides any displayed message.
 */
export function hideMessage() {
    const messageElement = document.getElementById('error-message');
    if (messageElement) {
        messageElement.style.display = 'none';
        messageElement.className = 'error-message';
    }
}

/**
 * Shows the loading indicator for a specific step.
 * @param {string} stepId - The ID of the step ('step1', 'step2', etc.).
 */
export function showLoading(stepId) {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }

    // Optionally disable relevant buttons
    const stepElement = document.getElementById(stepId);
    if (stepElement) {
        const buttons = stepElement.querySelectorAll('button');
        buttons.forEach(button => {
            button.disabled = true;
        });
    }
}

/**
 * Hides the loading indicator.
 * @param {string} stepId - The ID of the step to re-enable buttons for.
 */
export function hideLoading(stepId) {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    // Re-enable buttons
    const stepElement = document.getElementById(stepId);
    if (stepElement) {
        const buttons = stepElement.querySelectorAll('button');
        buttons.forEach(button => {
            button.disabled = false;
        });
    }
}

/**
 * Updates the UI to display a specific step.
 * @param {number} stepNumber - The step number to display (1-4).
 */
export function updateUIForStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('.step');
    steps.forEach(step => {
        step.classList.remove('active');
    });

    // Show the target step
    const targetStep = document.getElementById(`step${stepNumber}`);
    if (targetStep) {
        targetStep.classList.add('active');
    }

    // Clear any displayed error/info messages
    hideMessage();
}

/**
 * Displays recipe cards in the UI.
 * @param {Array} recipes - Array of recipe objects from Spoonacular.
 * @param {Function} selectionCallback - Callback function when a recipe is selected.
 */
export function displayRecipes(recipes, selectionCallback) {
    const container = document.getElementById('recipe-results');
    if (!container) return;

    container.innerHTML = ''; // Clear previous results

    if (!recipes || recipes.length === 0) {
        container.innerHTML = '<p>No recipes found matching your ingredients and preferences. Try adding more ingredients or broadening your preferences.</p>';
        return;
    }

    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';

        // Create card content
        card.innerHTML = `
            <h3>${recipe.title}</h3>
            ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.title}">` : ''}
            <p>Uses ${recipe.usedIngredientCount} of your ingredients</p>
            <p>Missing ${recipe.missedIngredientCount} ingredients</p>
        `;

        // Add click event
        card.addEventListener('click', () => {
            // Remove selected class from all cards
            document.querySelectorAll('.recipe-card').forEach(c => {
                c.classList.remove('selected');
            });

            // Add selected class to this card
            card.classList.add('selected');

            // Call the selection callback
            if (typeof selectionCallback === 'function') {
                selectionCallback(recipe.id, recipe.title);
            }
        });

        container.appendChild(card);
    });
}

/**
 * Displays missing ingredients in the UI.
 * @param {Array} ingredients - Array of missing ingredient objects.
 * @param {boolean} isEstimate - Whether these are estimated ingredients.
 */
export function displayMissingIngredients(ingredients, isEstimate) {
    const container = document.getElementById('missing-ingredients-container');
    if (!container) return;

    container.innerHTML = ''; // Clear previous results

    if (isEstimate) {
        const notice = document.createElement('div');
        notice.className = 'fallback-notice';
        notice.textContent = 'Note: These ingredients are estimates since we couldn\'t retrieve the exact recipe details.';
        container.appendChild(notice);
    }

    if (!ingredients || ingredients.length === 0) {
        const message = document.createElement('div');
        message.className = 'complete-message';
        message.textContent = 'Good news! You have all the ingredients needed for this recipe.';
        container.appendChild(message);
        return;
    }

    const list = document.createElement('ul');
    list.className = 'ingredients-list';

    ingredients.forEach(ingredient => {
        const item = document.createElement('li');
        // Format with amount and unit if available
        let text = ingredient.name;
        if (ingredient.amount) {
            text = `${ingredient.amount} ${ingredient.unit || ''} ${ingredient.name}`.trim().replace('  ', ' ');
        }
        item.textContent = text;
        list.appendChild(item);
    });

    container.appendChild(list);
}

/**
 * Displays the confirmation message in Step 4.
 * @param {string} message - The confirmation message to display.
 * @param {boolean} updateStep - Whether to update UI to Step 4 (default: true).
 */
export function displayConfirmation(message, updateStep = true) {
    const confirmationElement = document.getElementById('confirmation-message');
    if (confirmationElement) {
        confirmationElement.textContent = message;
    }

    if (updateStep) {
        updateUIForStep(4);
    }
}

/**
 * Resets the UI to its initial state.
 */
export function resetUI() {
    // Reset all form inputs
    const ingredientsInput = document.getElementById('ingredients-input');
    if (ingredientsInput) {
        ingredientsInput.value = '';
    }

    const foodTypePref = document.getElementById('food-type-pref');
    if (foodTypePref) {
        foodTypePref.value = 'any';
    }

    const cuisinePref = document.getElementById('cuisine-pref');
    if (cuisinePref) {
        cuisinePref.value = 'any';
    }

    const telegramChatId = document.getElementById('telegram-chat-id');
    if (telegramChatId) {
        telegramChatId.value = '';
    }

    const emailAddress = document.getElementById('email-address');
    if (emailAddress) {
        emailAddress.value = '';
    }

    // Clear recipe results and missing ingredients
    const recipeResults = document.getElementById('recipe-results');
    if (recipeResults) {
        recipeResults.innerHTML = '';
    }

    const missingIngredientsContainer = document.getElementById('missing-ingredients-container');
    if (missingIngredientsContainer) {
        missingIngredientsContainer.innerHTML = '';
    }

    // Reset radio buttons
    const telegramRadio = document.getElementById('telegram-radio');
    if (telegramRadio) {
        telegramRadio.checked = true;
    }

    // Show telegram options, hide email options
    const telegramOptions = document.getElementById('telegram-options');
    if (telegramOptions) {
        telegramOptions.style.display = 'block';
    }

    const emailOptions = document.getElementById('email-options');
    if (emailOptions) {
        emailOptions.style.display = 'none';
    }

    // Hide any error messages
    hideMessage();

    // Return to step 1
    updateUIForStep(1);
}

/**
 * Creates and initializes a debug panel in the UI.
 * Should be called once during initial page load.
 */
export function initDebugPanel() {
    // Check if debug panel already exists
    if (document.getElementById('debug-panel')) {
        return;
    }

    // Create debug panel elements
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background-color: #f0f0f0;
        border-top: 2px solid #ccc;
        max-height: 30vh;
        display: none;
        flex-direction: column;
        z-index: 1000;
    `;

    const debugHeader = document.createElement('div');
    debugHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 5px 10px;
        background-color: #ddd;
        cursor: pointer;
    `;
    debugHeader.innerHTML = '<span>Debug Panel</span><span id="debug-toggle">▼</span>';

    const debugContent = document.createElement('div');
    debugContent.id = 'debug-content';
    debugContent.style.cssText = `
        padding: 10px;
        overflow-y: auto;
        flex-grow: 1;
        font-family: monospace;
    `;

    const logContainer = document.createElement('pre');
    logContainer.id = 'debug-log';
    logContainer.style.cssText = `
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
    `;

    // Assemble the panel
    debugContent.appendChild(logContainer);
    debugPanel.appendChild(debugHeader);
    debugPanel.appendChild(debugContent);
    document.body.appendChild(debugPanel);

    // Toggle panel visibility on header click
    debugHeader.addEventListener('click', () => {
        const isVisible = debugPanel.style.display === 'flex';
        debugPanel.style.display = isVisible ? 'none' : 'flex';
        document.getElementById('debug-toggle').textContent = isVisible ? '▼' : '▲';
    });

    // Add keyboard shortcut (Ctrl+Shift+D) to toggle panel
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'D') {
            debugHeader.click();
            event.preventDefault();
        }
    });

    // Log initial message
    addDebugMessage('Debug panel initialized. Press Ctrl+Shift+D to toggle.', 'info');
}

/**
 * Adds a message to the debug panel.
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('log', 'info', 'warn', 'error', 'llm')
 */
export function addDebugMessage(message, type = 'log') {
    const debugLog = document.getElementById('debug-log');
    if (!debugLog) return;

    const timestamp = new Date().toLocaleTimeString();
    let color = 'black';

    switch (type) {
        case 'info':
            color = 'blue';
            break;
        case 'warn':
            color = 'orange';
            break;
        case 'error':
            color = 'red';
            break;
        case 'llm':
            color = 'purple';
            break;
        default:
            color = 'black';
    }

    const logEntry = document.createElement('div');
    logEntry.style.color = color;
    logEntry.innerHTML = `[${timestamp}] ${type.toUpperCase()}: ${message}`;

    debugLog.appendChild(logEntry);

    // Auto-scroll to bottom
    debugLog.scrollTop = debugLog.scrollHeight;
}

/**
 * Logs an LLM prompt to the debug panel.
 * @param {number} stage - The stage number (1, 2, or 3)
 * @param {string} prompt - The LLM prompt
 */
export function logLLMPromptToDebugPanel(stage, prompt) {
    if (!prompt) return;

    const stageNames = {
        1: "Find Recipes",
        2: "Get Missing Ingredients",
        3: "Send Shopping List"
    };

    const stageName = stageNames[stage] || `Stage ${stage}`;

    // Make sure debug panel exists
    const debugPanel = document.getElementById('debug-panel');
    if (!debugPanel) {
        initDebugPanel();
    }

    // Make panel visible if it's not
    debugPanel.style.display = 'flex';
    document.getElementById('debug-toggle').textContent = '▲';

    // Add the message
    addDebugMessage(`LLM Prompt for ${stageName}:`, 'llm');
    addDebugMessage(prompt, 'log');
}