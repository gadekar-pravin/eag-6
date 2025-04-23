/**
 * API Module (JavaScript Frontend)
 * Handles interactions with the Python backend API.
 */

// Backend URL (should match the running Python backend)
export const BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Helper function to make fetch requests to the backend.
 * @param {string} endpoint - The backend endpoint path (e.g., '/find-recipes').
 * @param {object} payload - The data to send in the request body.
 * @param {string} method - HTTP method (default 'POST').
 * @returns {Promise<object>} - The parsed JSON response from the backend.
 * @throws {Error} - Throws specific errors for network issues or non-OK responses.
 */
async function fetchBackend(endpoint, payload, method = 'POST') {
    const url = `${BACKEND_URL}${endpoint}`;
    console.log(`Calling backend: ${method} ${url}`, payload);
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                 'Accept': 'application/json',
            },
            body: method !== 'GET' ? JSON.stringify(payload) : undefined // Don't send body for GET
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                // If response is not JSON
                errorData = { detail: `HTTP ${response.status}: ${response.statusText}` };
            }
            console.error(`Backend error (${response.status}):`, errorData);
            // Use 'detail' field from FastAPI's HTTPException or a generic message
            throw new Error(errorData.detail || `Backend request failed with status ${response.status}`);
        }

        // Check content type before parsing JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
             return await response.json();
        } else {
             // Handle non-JSON responses if necessary, or throw error
             console.warn(`Received non-JSON response from ${url}`);
             // For GET / endpoint which returns text/html
             if (method === 'GET' && endpoint === '/') {
                 return { message: await response.text(), status: response.status };
             }
             return { message: await response.text() }; // Example: return text content
        }

    } catch (error) {
        console.error(`Network or fetch error calling backend endpoint ${endpoint}:`, error);
        // Differentiate network errors from HTTP errors
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
             throw new Error('BACKEND_UNREACHABLE'); // Specific error for network issue
        }
        throw error; // Re-throw other errors (like the ones created for non-OK responses)
    }
}

/**
 * Fetches recipes from the backend based on ingredients and preferences.
 * @param {string} ingredients - Comma-separated string of ingredients.
 * @param {{foodType: string, cuisine: string}} preferences - User preferences.
 * @returns {Promise<{data: Array|null, error: string|null, llm_prompt: string|null}>} - Result object.
 */
export async function fetchRecipesFromBackend(ingredients, preferences) {
    const payload = {
        ingredients: ingredients,
        foodType: preferences.foodType || 'any',
        cuisine: preferences.cuisine || 'any'
    };
    try {
        const response = await fetchBackend('/find-recipes', payload, 'POST');

        // Log the LLM prompt if available
        if (response.llm_prompt) {
            console.log('%c [LLM PROMPT - Find Recipes] ', 'background: #1a3a5f; color: white; padding: 2px 5px; border-radius: 3px;');
            console.log(response.llm_prompt);
        }

        // Adapt to the Python Pydantic response model (FindRecipesResponse)
        return {
            data: response.recipes || [],
            error: response.error || null,
            llm_prompt: response.llm_prompt || null
        };
    } catch (error) {
         // Translate specific errors
         const errorMessage = error.message === 'BACKEND_UNREACHABLE'
            ? 'Cannot connect to the backend service. Please ensure it is running.'
            : `Failed to fetch recipes: ${error.message}`;
        return { data: null, error: errorMessage, llm_prompt: null };
    }
}

/**
 * Fetches missing ingredients details from the backend.
 * @param {number} recipeId - The ID of the recipe.
 * @param {string} recipeTitle - The title of the recipe.
 * @param {Array<string>} userIngredientsList - List of ingredients the user has.
 * @returns {Promise<{missingIngredients: Array|null, isEstimate: boolean, error: string|null, llm_prompt: string|null}>} - Result object.
 */
export async function fetchMissingIngredientsFromBackend(recipeId, recipeTitle, userIngredientsList) {
    const payload = {
        recipeId: recipeId,
        recipeTitle: recipeTitle,
        userIngredients: userIngredientsList || [] // Ensure it's an array
    };
    try {
        const response = await fetchBackend('/get-missing-ingredients', payload, 'POST');

        // Log the LLM prompt if available
        if (response.llm_prompt) {
            console.log('%c [LLM PROMPT - Get Missing Ingredients] ', 'background: #1a3a5f; color: white; padding: 2px 5px; border-radius: 3px;');
            console.log(response.llm_prompt);
        }

        // Adapt to GetMissingIngredientsResponse Pydantic model
        return {
            missingIngredients: response.missingIngredients || [],
            isEstimate: response.isEstimate || false,
            error: response.error || null,
            llm_prompt: response.llm_prompt || null
        };
    } catch (error) {
         const errorMessage = error.message === 'BACKEND_UNREACHABLE'
            ? 'Cannot connect to the backend service. Please ensure it is running.'
            : `Failed to get missing ingredients: ${error.message}`;
        return { missingIngredients: null, isEstimate: false, error: errorMessage, llm_prompt: null };
    }
}


/**
 * Sends the shopping list details to the backend.
 * @param {'telegram' | 'email'} method - Delivery method.
 * @param {string} destination - Telegram Chat ID or Email address.
 * @param {string} recipeTitle - Title of the recipe.
 * @param {Array} ingredients - Array of missing ingredient objects (matching IngredientDetail model).
 * @returns {Promise<{successMessage: string|null, error: string|null, llm_prompt: string|null}>} - Result object.
 */
export async function sendListToBackend(method, destination, recipeTitle, ingredients) {
    const payload = {
        deliveryMethod: method,
        deliveryDetails: destination,
        recipeTitle: recipeTitle,
        missingIngredients: ingredients || []
    };
    try {
        const response = await fetchBackend('/send-list', payload, 'POST');

        // Log the LLM prompt if available
        if (response.llm_prompt) {
            console.log('%c [LLM PROMPT - Send List] ', 'background: #1a3a5f; color: white; padding: 2px 5px; border-radius: 3px;');
            console.log(response.llm_prompt);
        }

        // Adapt to SendListResponse Pydantic model
        if (response.success) {
            return {
                successMessage: response.message,
                error: null,
                llm_prompt: response.llm_prompt || null
            };
        } else {
            return {
                successMessage: null,
                error: response.message || 'Failed to send list via backend.',
                llm_prompt: response.llm_prompt || null
            };
        }
    } catch (error) {
        const errorMessage = error.message === 'BACKEND_UNREACHABLE'
            ? 'Cannot connect to the backend service. Please ensure it is running.'
            : `Failed to send shopping list: ${error.message}`;
        return { successMessage: null, error: errorMessage, llm_prompt: null };
    }
}

/**
 * Pings the backend status endpoint.
 * @returns {Promise<{ok: boolean, message?: string}>} Status of the backend.
 */
export async function checkBackendStatus() {
    try {
        const response = await fetchBackend('/', null, 'GET');
        // Assuming the root endpoint returns a 2xx status and a message
        return { ok: response.status >= 200 && response.status < 300 };
    } catch (error) {
        console.warn("Backend status check failed:", error.message);
        return { ok: false, message: error.message };
    }
}