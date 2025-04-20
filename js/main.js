/**
 * Main Entry Point
 * Initializes modules, sets up event listeners, and delegates actions.
 */

import * as memory from './memory.js';
import * as decisionMaking from './decision-making.js';
import * as action from './action.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded. Initializing Recipe Suggester...");

    // Initialize memory (loads API keys etc.)
    await memory.loadInitialState();

    // Get references to UI elements via the action module
    const els = action.getDOMElements();

    // Populate config panel inputs with loaded keys
    action.setConfigInputValue('spoonacularKey', memory.getApiKey('spoonacularKey'));
    action.setConfigInputValue('telegramBotKey', memory.getApiKey('telegramBotKey'));
    action.setConfigInputValue('sendgridKey', memory.getApiKey('sendgridKey'));
    action.setConfigInputValue('geminiKey', memory.getApiKey('geminiKey'));

    // --- Event Listeners ---

    // Step 1: Find Recipes
    els.findRecipesBtn.addEventListener('click', () => {
        const inputData = {
            ingredients: els.ingredientsInput.value,
            foodType: els.foodTypePrefElement.value,
            cuisine: els.cuisinePrefElement.value
        };
        decisionMaking.handleIngredientInput(inputData);
    });

    // Step 3: Send List
    els.sendListBtn.addEventListener('click', () => {
        const deliveryMethod = els.telegramRadio.checked ? 'telegram' : 'email';
        const deliveryDetails = deliveryMethod === 'telegram'
            ? els.telegramChatIdInput.value
            : els.emailAddressInput.value;

        const requestData = {
            deliveryMethod: deliveryMethod,
            deliveryDetails: deliveryDetails.trim()
        };
        decisionMaking.handleSendListRequest(requestData);
    });

    // Step 4: Start Over
    els.startOverBtn.addEventListener('click', () => {
        decisionMaking.handleStartOver();
    });

    // Navigation: Back Buttons
    els.backToStep1Btn.addEventListener('click', () => {
        action.updateUIForStep(1);
    });

    els.backToStep2Btn.addEventListener('click', () => {
        // Clear selection visually if going back
        document.querySelectorAll('.recipe-card.selected').forEach(card => card.classList.remove('selected'));
        // Reset potential state related to selection if needed (though handled by starting step 2 again)
        memory.setSelectedRecipe(null);
        memory.setMissingIngredients([]);
        action.updateUIForStep(2);
    });

    // Configuration Panel
    els.configButton.addEventListener('click', () => {
        // Toggle visibility based on current display state
        const isVisible = els.configPanel.style.display === 'block';
        action.toggleConfigPanel(!isVisible);
    });

    els.saveConfigBtn.addEventListener('click', () => {
        const configData = {
            spoonacularKey: els.spoonacularKeyInput.value,
            telegramBotKey: els.telegramBotKeyInput.value,
            sendgridKey: els.sendgridKeyInput.value,
            geminiKey: els.geminiKeyInput.value
        };
        decisionMaking.handleSaveConfig(configData);
    });

    // Delivery Method Toggles
    els.telegramRadio.addEventListener('change', function() {
        if (this.checked) {
            els.telegramOptions.style.display = 'block';
            els.emailOptions.style.display = 'none';
        }
    });

    els.emailRadio.addEventListener('change', function() {
        if (this.checked) {
            els.telegramOptions.style.display = 'none';
            els.emailOptions.style.display = 'block';
        }
    });

    console.log("Recipe Suggester Initialized.");
});