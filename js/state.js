/**
 * Memory Module (JavaScript Frontend)
 * Handles minimal frontend state management. API keys and complex history are backend concerns.
 */

// Default structure for basic state
const initialState = {
    userIngredientsRaw: '', // Store the raw input string
    userIngredientsList: [], // Parsed list of ingredients
    selectedRecipe: null, // { id: number, title: string }
    missingIngredientsList: [], // [{ name: string, amount: number|null, unit: string|null, is_estimate?: boolean }]
    lastError: null,
    userPreferences: { foodType: 'any', cuisine: 'any' },
    // Added LLM prompt storage
    lastLLMPrompt: null,
    lastLLMPromptStage: null,
    lastLLMPromptTime: null,
    // Simplified history log (optional)
    simpleLog: [] // e.g., ["Found 5 recipes", "Selected 'Pasta Bake'", "Calculated 3 missing ingredients", "Sent list via email"]
};

// In-memory state
let state = { ...initialState };

// No longer storing API keys or detailed conversation history here

/**
 * Resets the frontend state to its initial values.
 */
export function resetState() {
    state = JSON.parse(JSON.stringify(initialState)); // Deep copy for reset
    console.log("Frontend state reset.");
}

/**
 * Updates specific fields in the frontend state.
 * @param {object} updates - An object containing fields to update.
 */
export function updateState(updates) {
    state = { ...state, ...updates };
    // Optionally log updates or save minimal state to local storage for debugging
    // chrome.storage.local.set({ frontendState: state });
    console.log("Frontend state updated:", updates);
}

/**
 * Gets the entire current state object (returns a copy).
 * @returns {object} A copy of the current state.
 */
export function getState() {
    return JSON.parse(JSON.stringify(state));
}

// --- Specific State Getters/Setters ---

export function setUserIngredients(rawIngredients) {
    const parsedList = rawIngredients.split(',')
        .map(i => i.trim())
        .filter(i => i.length > 0);
    updateState({
        userIngredientsRaw: rawIngredients,
        userIngredientsList: parsedList
    });
}

export function getUserIngredientsList() {
    return [...(state.userIngredientsList || [])];
}

export function setSelectedRecipe(recipe) { // recipe: { id: number, title: string } | null
    updateState({ selectedRecipe: recipe ? { ...recipe } : null });
}

export function getSelectedRecipe() {
    const recipe = state.selectedRecipe;
    return recipe ? { ...recipe } : null;
}

export function setMissingIngredients(ingredients) { // ingredients: array or null
    updateState({ missingIngredientsList: Array.isArray(ingredients) ? [...ingredients] : [] });
}

export function getMissingIngredients() {
    return [...(state.missingIngredientsList || [])];
}

export function setUserPreferences(prefs) { // prefs: { foodType: string, cuisine: string }
    updateState({ userPreferences: { ...prefs } });
}

export function getUserPreferences() {
    return { ...(state.userPreferences || { foodType: 'any', cuisine: 'any' }) };
}

export function logSimpleEvent(message) {
    const newLog = [...state.simpleLog, `${new Date().toLocaleTimeString()}: ${message}`];
     // Keep log reasonably sized (e.g., last 20 events)
     if (newLog.length > 20) {
         newLog.shift();
     }
    updateState({ simpleLog: newLog });
}

/**
 * Logs an LLM prompt to the console and stores it in state.
 * @param {number} stage - The stage number (1, 2, or 3)
 * @param {string} prompt - The LLM prompt text
 */
export function logLLMPrompt(stage, prompt) {
    if (!prompt) return;

    const stageNames = {
        1: "Find Recipes",
        2: "Get Missing Ingredients",
        3: "Send Shopping List"
    };

    const stageName = stageNames[stage] || `Stage ${stage}`;
    const headerStyle = 'background: #6200ee; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;';

    console.group(`%c LLM Prompt: ${stageName} `, headerStyle);
    console.log(prompt);
    // Log preference-related metadata if available
    if (state.lastLLMPromptMetadata) {
        console.log('Preference-related errors:', state.lastLLMPromptMetadata.errors || 'None');
        console.log('Preference-related uncertainties:', state.lastLLMPromptMetadata.uncertainties || 'None');
    }
    console.groupEnd();

    const logEntry = `LLM Prompt used for ${stageName}`;
    logSimpleEvent(logEntry);

    updateState({
        lastLLMPrompt: prompt,
        lastLLMPromptStage: stage,
        lastLLMPromptTime: new Date().toISOString(),
        lastLLMPromptMetadata: state.lastLLMPromptMetadata // Preserve metadata
    });

    try {
        import('./ui.js').then(ui => {
            if (typeof ui.logLLMPromptToDebugPanel === 'function') {
                ui.logLLMPromptToDebugPanel(stage, prompt);
                // Log preference metadata to debug panel
                if (state.lastLLMPromptMetadata) {
                    ui.addDebugMessage(`Preference Errors: ${state.lastLLMPromptMetadata.errors || 'None'}`, 'error');
                    ui.addDebugMessage(`Preference Uncertainties: ${state.lastLLMPromptMetadata.uncertainties || 'None'}`, 'warn');
                }
            }
        }).catch(err => {
            console.warn('Could not log to debug panel:', err);
        });
    } catch (e) {
        // Silently fail if module import doesn't work
    }
}

// --- Error Message Constants (Frontend specific) ---
export const ERROR_MESSAGES = {
    INVALID_INGREDIENTS: 'Please enter valid ingredients, separated by commas.',
    INVALID_RECIPE_SELECTION: 'Invalid recipe selection. Please click on a recipe from the list.',
    INVALID_DELIVERY_DETAILS: (reason) => `Invalid delivery details provided: ${reason}. Please check your input.`,
    GENERAL_ERROR: 'An unexpected error occurred. Please try again.',
    NO_RECIPES_FOUND: 'No recipes found with these ingredients/preferences. Try adding more common ingredients, checking spelling, or broadening preferences.',
    BACKEND_UNREACHABLE: 'Cannot connect to the backend service. Please ensure it is running.',
    BACKEND_ERROR: (detail) => `Backend Error: ${detail || 'An unknown error occurred on the server.'}`, // For displaying errors from Python
};

// Initialize state on load
resetState();