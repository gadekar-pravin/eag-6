/**
 * Main Entry Point (JavaScript Frontend)
 * Initializes modules, sets up event listeners, and delegates actions.
 */

import * as state from './state.js';          // Renamed from memory
import * as controller from './controller.js'; // Renamed from decisionMaking
import * as ui from './ui.js';                // NEW: For UI functions
import * as api from './api.js';              // NEW: For API functions (specifically BACKEND_URL and checkBackendStatus)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded. Initializing Recipe Suggester Frontend...");

    // Frontend state is reset on load by state.js itself

    // Initialize the debug panel
    ui.initDebugPanel();

    // Get references to UI elements via the UI module
    const els = ui.getDOMElements();

    // --- Helper function for adding listeners safely ---
    function addSafeListener(element, event, handler, elementName) {
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.error(`UI element "${elementName}" not found. Cannot attach ${event} listener.`);
            // Optionally, disable related functionality or show a UI error
        }
    }

    // --- Event Listeners (using safe helper) ---

    // Step 1: Find Recipes
    addSafeListener(els.findRecipesBtn, 'click', () => {
        const inputData = {
            ingredients: els.ingredientsInput?.value ?? '', // Use optional chaining for safety
            foodType: els.foodTypePrefElement?.value ?? 'any',
            cuisine: els.cuisinePrefElement?.value ?? 'any'
        };
        // Let controller handle validation and processing
        controller.handleIngredientInput(inputData);
    }, 'findRecipesBtn');

    // Step 3: Send List
    addSafeListener(els.sendListBtn, 'click', () => {
        // Check radio buttons safely
        const deliveryMethod = els.telegramRadio?.checked ? 'telegram' : 'email';
        const deliveryDetails = deliveryMethod === 'telegram'
            ? els.telegramChatIdInput?.value ?? ''
            : els.emailAddressInput?.value ?? '';

        const requestData = {
            deliveryMethod: deliveryMethod,
            deliveryDetails: deliveryDetails.trim()
        };
        // Let controller handle validation and processing
        controller.handleSendListRequest(requestData);
    }, 'sendListBtn');

    // Step 4: Start Over
    addSafeListener(els.startOverBtn, 'click', () => {
        // Delegate to controller
        controller.handleStartOver();
    }, 'startOverBtn');

    // Navigation: Back Buttons
    addSafeListener(els.backToStep1Btn, 'click', () => {
        ui.updateUIForStep(1); // Use UI module
        state.logSimpleEvent("Navigated back to Step 1."); // Use state module
    }, 'backToStep1Btn');

    addSafeListener(els.backToStep2Btn, 'click', () => {
        // Clear selection visually if going back
        document.querySelectorAll('.recipe-card.selected').forEach(card => card.classList.remove('selected'));
        // Reset frontend state related to selection
        state.setSelectedRecipe(null); // Use state module
        state.setMissingIngredients([]); // Use state module
        ui.updateUIForStep(2); // Use UI module
        state.logSimpleEvent("Navigated back to Step 2."); // Use state module
    }, 'backToStep2Btn');

    // Delivery Method Toggles (Direct UI manipulation, now safe)
    addSafeListener(els.telegramRadio, 'change', function() {
        if (this.checked && els.telegramOptions && els.emailOptions) {
            els.telegramOptions.style.display = 'block';
            els.emailOptions.style.display = 'none';
        } else if (!els.telegramOptions || !els.emailOptions) {
            console.error("Telegram/Email option containers not found for toggling.");
        }
    }, 'telegramRadio');

    addSafeListener(els.emailRadio, 'change', function() {
        if (this.checked && els.telegramOptions && els.emailOptions) {
            els.telegramOptions.style.display = 'none';
            els.emailOptions.style.display = 'block';
        } else if (!els.telegramOptions || !els.emailOptions) {
            console.error("Telegram/Email option containers not found for toggling.");
        }
    }, 'emailRadio');

    // Add keyboard shortcut for toggling debug panel (Ctrl+Shift+D)
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'D') {
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                const isVisible = debugPanel.style.display === 'flex';
                debugPanel.style.display = isVisible ? 'none' : 'flex';
                const debugToggle = document.getElementById('debug-toggle');
                if (debugToggle) {
                    debugToggle.textContent = isVisible ? '▼' : '▲';
                }
            }
            event.preventDefault();
        }
    });

    console.log("Recipe Suggester Frontend Initialized.");
    state.logSimpleEvent("Extension popup opened."); // Use state module

    // Check backend status on popup open
    try {
        const backendStatus = await api.checkBackendStatus(); // Use API module
        if (!backendStatus.ok) {
            ui.showMessage(state.ERROR_MESSAGES.BACKEND_UNREACHABLE, true, false); // Use UI & state modules
        } else {
            console.log("Backend status check: OK");
        }
    } catch (error) {
        // checkBackendStatus should catch internal errors, but handle potential promise rejection
        console.error("Error during backend status check:", error);
        ui.showMessage(state.ERROR_MESSAGES.BACKEND_UNREACHABLE, true, false); // Use UI & state modules
    }
});