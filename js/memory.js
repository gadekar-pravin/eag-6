/**
 * Memory Module
 * Handles state management, including conversation history and API keys.
 */

// Default structure for conversation history
const initialHistory = {
    query1: '', llmResponse1: '', toolCall1: '', toolResult1: '', selfCheck1: '', reasoningTypes1: [], error1: '', uncertainty1: '', retryCount1: 0,
    query2: '', llmResponse2: '', toolCall2: '', toolResult2: '', selfCheck2: '', reasoningTypes2: [], error2: '', uncertainty2: '', retryCount2: 0,
    query3: '', llmResponse3: '', toolCall3: '', toolResult3: '', selfCheck3: '', reasoningTypes3: [], error3: '', uncertainty3: '', retryCount3: 0,
    finalResult: '',
    // Add user preferences storage
    userPreferences: { foodType: 'any', cuisine: 'any' }
};

// In-memory state
let conversationHistory = { ...initialHistory };
let apiKeys = {
    spoonacularKey: '',
    telegramBotKey: '',
    sendgridKey: '',
    geminiKey: ''
};
let selectedRecipe = null;
let missingIngredientsList = [];

// Maximum number of retries for LLM calls
const MAX_LLM_RETRIES = 3;
// Maximum number of retries for external API calls (Spoonacular, Telegram, SendGrid)
const MAX_API_RETRIES = 2;

/**
 * Loads API keys from chrome.storage.sync into the local state.
 * @returns {Promise<void>}
 */
async function loadApiKeys() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['spoonacularKey', 'telegramBotKey', 'sendgridKey', 'geminiKey'], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading API keys:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                apiKeys.spoonacularKey = result.spoonacularKey || '';
                apiKeys.telegramBotKey = result.telegramBotKey || '';
                apiKeys.sendgridKey = result.sendgridKey || '';
                apiKeys.geminiKey = result.geminiKey || '';
                console.log("API Keys loaded.");
                resolve();
            }
        });
    });
}

/**
 * Initializes the memory module by loading API keys.
 * @returns {Promise<void>}
 */
export async function loadInitialState() {
    await loadApiKeys();
    // Reset history just in case
    resetConversationHistory();
    console.log("Memory module initialized.");
}

/**
 * Retrieves a specific API key.
 * @param {'spoonacularKey' | 'telegramBotKey' | 'sendgridKey' | 'geminiKey'} keyName
 * @returns {string} The API key value.
 */
export function getApiKey(keyName) {
    return apiKeys[keyName] || '';
}

/**
 * Updates multiple API keys and saves them to chrome.storage.sync.
 * @param {object} keysToUpdate - Object with key-value pairs to update.
 * @returns {Promise<void>}
 */
export async function updateAndSaveApiKeys(keysToUpdate) {
    return new Promise((resolve, reject) => {
        // Update local state first
        Object.assign(apiKeys, keysToUpdate);

        // Prepare only the keys we manage for saving
        const dataToSave = {
            spoonacularKey: apiKeys.spoonacularKey,
            telegramBotKey: apiKeys.telegramBotKey,
            sendgridKey: apiKeys.sendgridKey,
            geminiKey: apiKeys.geminiKey,
        };

        chrome.storage.sync.set(dataToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving API keys:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                console.log("API Keys saved:", dataToSave);
                resolve();
            }
        });
    });
}

/**
 * Retrieves a specific field or the full conversation history.
 * Returns a deep copy for the full history to prevent mutation.
 * @param {string} [fieldName] - Optional field name.
 * @returns {any} The value of the field or a copy of the full history object.
 */
export function getHistoryField(fieldName) {
    if (fieldName) {
        return conversationHistory[fieldName];
    }
    // Return a deep copy if requesting the full history
    return JSON.parse(JSON.stringify(conversationHistory));
}

/**
 * Updates one or more fields in the conversation history.
 * @param {object} updatesObject - An object containing fields to update.
 */
export function updateConversationHistory(updatesObject) {
    conversationHistory = { ...conversationHistory, ...updatesObject };
    // Optionally log history updates for debugging
    // console.log("History updated:", updatesObject);

    // Persist history to local storage for debugging/review
    chrome.storage.local.set({ lastConversation: conversationHistory }, () => {
        if (chrome.runtime.lastError) {
            console.warn("Could not save conversation history to local storage:", chrome.runtime.lastError);
        }
    });
}

/**
 * Resets the conversation history to its initial state.
 */
export function resetConversationHistory() {
    conversationHistory = JSON.parse(JSON.stringify(initialHistory)); // Deep copy
    selectedRecipe = null;
    missingIngredientsList = [];
    console.log("Conversation history reset.");
}

// --- Specific State Getters/Setters ---

export function setSelectedRecipe(recipe) {
    selectedRecipe = recipe ? { ...recipe } : null;
}

export function getSelectedRecipe() {
    return selectedRecipe ? { ...selectedRecipe } : null;
}

export function setMissingIngredients(ingredients) {
    missingIngredientsList = Array.isArray(ingredients) ? [...ingredients] : [];
}

export function getMissingIngredients() {
    return [...missingIngredientsList];
}

export function getUserIngredientsFromHistory() {
    try {
        const query1 = getHistoryField('query1') || '';
        const ingredientsMatch = query1.match(/I have (.*?)\./);
        if (ingredientsMatch && ingredientsMatch[1]) {
            return ingredientsMatch[1].split(',').map(item => item.trim()).filter(i => i);
        }
    } catch (e) {
        console.error("Could not parse user ingredients from query1:", e);
    }
    return [];
}

// --- Constants ---
export function getMaxLlmRetries() {
    return MAX_LLM_RETRIES;
}

export function getMaxApiRetries() {
    return MAX_API_RETRIES;
}

// --- Error Message Constants ---
export const ERROR_MESSAGES = {
    NO_API_KEY: (keyType) => `${keyType} API key not found. Please add your API key in the configuration panel.`,
    LLM_FAILURE: 'Unable to process your request via AI at this time. Using fallback logic.',
    INVALID_INGREDIENTS: 'Please enter valid ingredients, separated by commas.',
    INVALID_PREFERENCES: 'Please select valid preferences.',
    API_RATE_LIMIT: (apiName) => `${apiName} API rate limit exceeded. Please try again later.`,
    NETWORK_ERROR: 'Network error. Please check your internet connection.',
    UNCERTAIN_RESPONSE: 'AI Analysis Note: I\'m not entirely certain about this information.', // For display if needed
    TOOL_FAILURE: (toolName) => `A required external service (${toolName}) failed. Trying alternative approach.`, // For display if needed
    GENERAL_ERROR: 'An unexpected error occurred. Please try again.',
    NO_RECIPES_FOUND: 'No recipes found with these ingredients/preferences. Try adding more common ingredients, checking spelling, or broadening preferences.',
    INVALID_RECIPE_SELECTION: 'Invalid recipe selection. Please click on a recipe from the list.',
    INVALID_DELIVERY_DETAILS: (reason) => `Invalid delivery details provided: ${reason}. Please check your input.`,
    SPOONACULAR_AUTH_ERROR: 'Spoonacular API key seems invalid or unauthorized. Please check configuration.',
    SPOONACULAR_NOT_FOUND: (id) => `Recipe details for ID ${id} not found. It might have been removed.`,
    TELEGRAM_AUTH_ERROR: 'Telegram API key seems invalid or unauthorized. Check configuration.',
    SENDGRID_AUTH_ERROR: 'SendGrid API key seems invalid or unauthorized. Check configuration.',
    TELEGRAM_CHAT_NOT_FOUND: 'Telegram Error: Chat ID not found or invalid.',
    TELEGRAM_BOT_BLOCKED: 'Telegram Error: Bot blocked by user.',
    SENDGRID_INVALID_EMAIL: 'SendGrid Error: Invalid recipient email format.',
    SENDGRID_SENDER_ISSUE: 'SendGrid Error: Sender email not verified. Check SendGrid setup.'
};