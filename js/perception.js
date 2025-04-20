/**
 * Perception Module
 * Handles interactions with the LLM (Gemini).
 */

import { getMaxLlmRetries } from './memory.js'; // Import retry const

// Function to build a reasoning prompt wrapper for the LLM (Enhanced version)
function buildReasoningPrompt(query, stage) {
    // Base reasoning prompt with reasoning type awareness
    let reasoningPrompt = `I want you to think step-by-step about this request. First, understand what is being asked. Then, analyze the information available to you. Consider what additional information or API calls might be needed. Explain your thinking process as you go.

    When responding to this query, break down the problem into components that require different types of reasoning, and for each component:
    1. Identify the type of reasoning required using [REASONING TYPE: X] tags, where X can be one of: ARITHMETIC, RETRIEVAL, COMPARISON, LOGICAL, CAUSAL, ANALOGICAL, CREATIVE, SOCIAL
    2. Apply that reasoning type explicitly
    3. Explain your conclusion from that reasoning step

    Explicitly use these tags throughout your analysis to make your reasoning transparent.

    IMPORTANT: When you are uncertain about something, explicitly state your uncertainty using [UNCERTAINTY: X] tags, where X describes what you're uncertain about and your confidence level (low/medium/high). For example: [UNCERTAINTY: I'm moderately confident these are common cooking ingredients, but 'szechuan peppercorns' might be specialized].

    If you encounter information that's critical but missing, or if you can't determine something with confidence, use [ERROR: X] tags to flag this, where X describes the issue. For example: [ERROR: Cannot determine ingredient quantities from the provided information].`;

    // Add stage-specific self-check instructions
    if (stage === 1) {
        reasoningPrompt += `

    IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
    1. Verify that you've correctly identified all the ingredients provided. Are they plausible cooking ingredients?
    2. Identify any stated user preferences (like food type or cuisine) within the query. Are they clear?
    3. Check if there are ambiguous ingredient names that might need clarification (e.g., 'apple' - what kind?).
    4. Confirm that searching for recipes with these ingredients and preferences is an appropriate action.
    5. Validate that the Spoonacular API (recipe search by ingredients) is the right tool for this query, considering preferences.

    Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

    ERROR HANDLING:
    - If ingredients appear invalid or unclear (e.g., non-food items, gibberish), flag this with [ERROR: Invalid ingredients provided: X] and suggest clarifications.
    - If preferences seem contradictory or unclear, flag with [ERROR: Ambiguous preferences: X].
    - If you believe some ingredients might not be found in standard recipe databases, mark with [UNCERTAINTY: Ingredient X might be too niche].
    - If the intended tool (Spoonacular API) is known to be unavailable/failing, state this [ERROR: Spoonacular tool unavailable]. If tool access fails during execution, be prepared to provide general recipe suggestions based on common combinations of the ingredients provided.
    - If the tool call succeeds but returns no results, suggest adding more common ingredients to the list, checking spelling, or broadening preferences.
    - Note if Spoonacular API cannot fully filter by the preference [UNCERTAINTY: Spoonacular may not filter perfectly by cuisine X].`;
    } else if (stage === 2) {
        reasoningPrompt += `

    IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
    1. Verify you have correctly identified the selected recipe title and ID from the previous step/context.
    2. Confirm you have the list of user's available ingredients and preferences from the previous step/context.
    3. Validate that the next logical step is to get the selected recipe's *required* ingredients.
    4. Check that comparing required and available ingredients is the appropriate action for determining missing items.
    5. Verify the Spoonacular API (get recipe information by ID) is the right tool for retrieving recipe details.

    Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

    ERROR HANDLING:
    - If the recipe ID seems invalid or missing from context, flag with [ERROR: Recipe ID missing or invalid] and suggest reselecting a recipe.
    - If the user's available ingredients list is missing, flag with [ERROR: User ingredients list missing].
    - If unable to retrieve full recipe details via the tool, mark with [ERROR: Failed to retrieve recipe details for ID X] and fall back to using whatever partial information is available or generating fallback ingredients based on title.
    - If uncertain about ingredient matching logic (e.g., "onion" vs "red onion"), mark with [UNCERTAINTY: Matching X vs Y might be imprecise] and use your best judgment.
    - If the API call fails entirely after retries, provide general guidance on common ingredients needed for this type of recipe (use ANALOGICAL reasoning).`;
    } else if (stage === 3) {
        reasoningPrompt += `

    IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
    1. Verify you have correctly identified the intended delivery method (email or Telegram) from context.
    2. Confirm you have valid-looking delivery details (email address format or numeric chat ID) from context.
    3. Check that you have the list of missing ingredients (or confirmation of none missing) from the previous step/context.
    4. Validate that the selected recipe title is correctly carried over for context in the message.
    5. Verify the appropriate API tool (SendGrid or Telegram) is being selected based on the delivery method.

    Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

    ERROR HANDLING:
    - If delivery details appear invalid (malformed email, non-numeric chat ID), flag with [ERROR: Invalid delivery details: X].
    - If the missing ingredients list is missing from context, flag with [ERROR: Missing ingredients list unavailable].
    - If the missing ingredients list is empty, confirm this is okay and the message should reflect that.
    - If the delivery API tool call fails after retries, mark with [ERROR: Failed to send via X API] and inform the user the list could not be sent.
    - If uncertain about ingredient measurements or details in the list, mark with [UNCERTAINTY: Details for ingredient X are estimates] and provide your best estimate.`;
    }

    // Add the query
    reasoningPrompt += `

    Here is the query/context to respond to:
    ${query}

    Please structure your response with clearly labeled reasoning types using [REASONING TYPE: X] tags, include your SELF-CHECK section, flag any uncertainties with [UNCERTAINTY: X] tags, mark any errors with [ERROR: X] tags, and then conclude with the most helpful answer or action plan.`;

    return reasoningPrompt;
}

// Function to extract reasoning metadata, errors, and uncertainties from LLM response (Enhanced version)
function extractReasoningMetadata(llmResponse) {
    if (typeof llmResponse !== 'string') {
        console.warn("extractReasoningMetadata received non-string input:", llmResponse);
        return { selfCheck: 'Invalid input', reasoningTypes: [], uncertainties: '', errors: 'Invalid input' };
    }

    // Extract self-check section
    const selfCheckRegex = /SELF-CHECK(?::|)\s*([\s\S]*?)(?:\n\n|ERROR HANDLING:|Here is the query|Please structure|\Z)/i; // More robust end anchors
    const selfCheckMatch = llmResponse.match(selfCheckRegex);
    const selfCheck = selfCheckMatch ? selfCheckMatch[1].trim() : "No explicit self-check section found.";

    // Extract reasoning types used
    const reasoningTypesRegex = /\[REASONING TYPE:\s*([A-Z_]+)\]/g; // Allow underscore in type name potentially
    const reasoningMatches = [...llmResponse.matchAll(reasoningTypesRegex)];
    const reasoningTypes = reasoningMatches.map(match => match[1]);
    const uniqueReasoningTypes = [...new Set(reasoningTypes)];

    // Extract uncertainties
    const uncertaintyRegex = /\[UNCERTAINTY:\s*(.*?)\]/g;
    const uncertaintyMatches = [...llmResponse.matchAll(uncertaintyRegex)];
    const uncertainties = uncertaintyMatches.map(match => match[1].trim());
    const uniqueUncertainties = [...new Set(uncertainties)];
    const uncertaintyStr = uniqueUncertainties.join('; ') || ''; // Ensure it's never null/undefined

    // Extract errors
    const errorRegex = /\[ERROR:\s*(.*?)\]/g;
    const errorMatches = [...llmResponse.matchAll(errorRegex)];
    const errors = errorMatches.map(match => match[1].trim());
    const uniqueErrors = [...new Set(errors)];
    const errorStr = uniqueErrors.join('; ') || ''; // Ensure it's never null/undefined

    return {
        selfCheck: selfCheck,
        reasoningTypes: uniqueReasoningTypes,
        uncertainties: uncertaintyStr,
        errors: errorStr
    };
}

// Enhanced fallback response function
function simulateFallbackResponse(query, stage) {
    console.log(`Generating fallback response for stage ${stage}`);
    let response = "";
    let ingredients = [];
    let preferences = { foodType: 'any', cuisine: 'any' };
    try {
        if (query.includes("I have")) {
            const match = query.match(/I have (.*?)\./);
            if (match && match[1]) {
                ingredients = match[1].split(',').map(i => i.trim()).filter(i => i);
            }
        }
        if (query.includes("I prefer")) {
            const match = query.match(/I prefer (vegetarian|non-vegetarian|vegan) food/);
            if (match && match[1]) preferences.foodType = match[1];
        }
        if (query.includes("interested in")) {
            const match = query.match(/interested in (.*?) cuisine/);
            if (match && match[1]) preferences.cuisine = match[1];
        }
    } catch (e) { console.error("Error parsing context in fallback:", e); }

    let recipeTitle = "the recipe";
    try {
        if (query.includes("recipe:")) {
            const match = query.match(/recipe: (.*?)(?:\(|\.|\?|$|LLM Response:)/);
            if (match && match[1]) {
                recipeTitle = match[1].trim();
            }
        }
    } catch (e) { console.error("Error parsing recipe title in fallback:", e); }


    // Stage-specific fallback responses
    if (stage === 1) {
        const ingredientList = ingredients.length > 0 ? ingredients.join(', ') : "your ingredients";
        const prefText = `${preferences.foodType !== 'any' ? preferences.foodType : ''} ${preferences.cuisine !== 'any' ? preferences.cuisine : ''}`.trim();
        response = `[REASONING TYPE: RETRIEVAL] Identified ingredients: ${ingredientList}. Prefs: ${prefText || 'None'}.
[REASONING TYPE: LOGICAL] Next step is to search for recipes using these ingredients and prefs.
[REASONING TYPE: SOCIAL] The goal is to provide recipe suggestions to the user.

SELF-CHECK:
1. Ingredients: ${ingredientList}. (Assumed valid).
2. Preferences: ${prefText || 'None'}. (Assumed valid).
3. Ambiguity check: N/A (Fallback).
4. Action: Recipe search is appropriate.
5. Tool: Spoonacular API is the intended tool.
[UNCERTAINTY: High - Cannot validate inputs or search without API].
[ERROR: None detected in input query structure].

Okay, I see you have ${ingredientList}${prefText ? ` and prefer ${prefText}` : ''}. I will now proceed to search for recipes using the Spoonacular tool (simulated for fallback).`;
    } else if (stage === 2) {
        response = `[REASONING TYPE: RETRIEVAL] Selected recipe: ${recipeTitle}. User ingredients/prefs are known from context.
[REASONING TYPE: LOGICAL] Need to find required ingredients for ${recipeTitle} and compare with user's ingredients.
[REASONING TYPE: SOCIAL] Goal is to create a missing ingredients list for the user.

SELF-CHECK:
1. Recipe: ${recipeTitle}. (Assumed valid selection).
2. User ingredients/prefs: Available from context (assumed).
3. Action: Get recipe details is the next step.
4. Comparison: Correct method for missing items.
5. Tool: Spoonacular API (recipe info) is intended.
[UNCERTAINTY: High - Cannot get actual recipe ingredients or perform accurate comparison without API].
[ERROR: None detected in input query structure].

Alright, for the recipe ${recipeTitle}, I will now determine the missing ingredients based on what you provided earlier (simulated for fallback).`;
    } else if (stage === 3) {
        let deliveryMethod = "your preferred method";
        let deliveryDetails = "the provided details";
        try {
            if (query.includes("via telegram to")) {
                deliveryMethod = "Telegram";
                const match = query.match(/via telegram to ([-0-9]+)/); // More specific match for chat ID
                if (match && match[1]) deliveryDetails = match[1].trim();
            } else if (query.includes("via email to")) {
                deliveryMethod = "email";
                const match = query.match(/via email to ([^\s]+@[^\s]+)/); // Basic email match
                if (match && match[1]) deliveryDetails = match[1].trim();
            }
        } catch (e) { console.error("Error parsing delivery details in fallback:", e); }


        response = `[REASONING TYPE: RETRIEVAL] Delivery: ${deliveryMethod} to ${deliveryDetails}. Missing ingredients list from context. Recipe: ${recipeTitle}.
[REASONING TYPE: LOGICAL] Select appropriate API tool (Telegram/SendGrid) based on method. Format message.
[REASONING TYPE: SOCIAL] Send the formatted list to the user.

SELF-CHECK:
1. Method: ${deliveryMethod}.
2. Details: ${deliveryDetails}. (Assumed format is correct for fallback).
3. List: Available from context (assumed).
4. Recipe context: ${recipeTitle}.
5. Tool: Correct API selection based on method.
[UNCERTAINTY: High - Cannot validate details or guarantee successful send without API].
[ERROR: None detected in input query structure].

Okay, preparing to send the shopping list for ${recipeTitle} via ${deliveryMethod} to ${deliveryDetails} (simulated for fallback).`;
    } else {
        response = `[REASONING TYPE: LOGICAL] Processing request (unknown stage fallback).

SELF-CHECK:
General verification. Proceeding.
[UNCERTAINTY: High - Specific context unclear].
[ERROR: None].

Handling your request (simulated fallback).`;
    }

    const fallbackMetadata = extractReasoningMetadata(response);
    return {
        responseText: response,
        metadata: fallbackMetadata,
        error: null, // Fallback assumes no call error
        finalRetryCount: 0
    };
}

/**
 * Runs the LLM analysis for a given stage.
 * Handles retries internally.
 * @param {string} queryContext - The query and relevant context for the LLM.
 * @param {number} stage - The current workflow stage (1, 2, or 3).
 * @param {string} apiKey - The Gemini API key.
 * @param {number} initialRetryCount - The current retry count for this stage (from memory).
 * @returns {Promise<{responseText: string, metadata: object, error: string|null, finalRetryCount: number}>}
 */
export async function runLLMAnalysis(queryContext, stage, apiKey, initialRetryCount = 0) {
    const MAX_RETRIES = getMaxLlmRetries();
    let currentRetryCount = initialRetryCount;

    const reasoningPrompt = buildReasoningPrompt(queryContext, stage);

    // ** START: Log the complete prompt **
    console.log(`==== COMPLETE LLM PROMPT (STAGE ${stage}) ====`);
    console.log(reasoningPrompt);
    console.log("============================");
    // ** END: Log the complete prompt **


    if (!apiKey) {
        console.log("Gemini API key not found. Using fallback response.");
        // Log the prompt even when using fallback for debugging purposes
        console.log("Fallback Prompt Context (not sent to LLM):", reasoningPrompt);
        return simulateFallbackResponse(queryContext, stage);
    }

    while (currentRetryCount <= MAX_RETRIES) {
        try {
            const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
            console.log(`Sending request to Gemini API (Stage ${stage}, Attempt ${currentRetryCount + 1})...`);

            const response = await fetch(`${apiUrl}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: reasoningPrompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                let errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
                try {
                    const errorJson = await response.json();
                    if (errorJson && errorJson.error) errorData = errorJson;
                } catch (e) { console.error("Could not parse Gemini error response JSON:", e); }
                throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log("Received response from Gemini API:", data);

            if (!data.candidates || data.candidates.length === 0) {
                if (data.promptFeedback && data.promptFeedback.blockReason) {
                   throw new Error(`Gemini API request blocked due to prompt: ${data.promptFeedback.blockReason}. Details: ${JSON.stringify(data.promptFeedback.safetyRatings)}`);
                }
                throw new Error('Gemini API response missing candidates.');
            }

            const candidate = data.candidates[0];
            if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0 || !candidate.content.parts[0].text) {
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    throw new Error(`Gemini API generation stopped due to: ${candidate.finishReason}. Safety Ratings: ${JSON.stringify(candidate.safetyRatings)}`);
                }
                throw new Error('Invalid or empty response structure received from Gemini API.');
            }

            let responseText = candidate.content.parts[0].text;
            const metadata = extractReasoningMetadata(responseText);
            console.log(`SELF-CHECK (STAGE ${stage}):`, metadata.selfCheck);
            console.log(`REASONING TYPES USED (STAGE ${stage}):`, metadata.reasoningTypes);
            console.log(`UNCERTAINTIES (STAGE ${stage}):`, metadata.uncertainties);
            console.log(`ERRORS (STAGE ${stage}):`, metadata.errors);

            // Success! Return the result.
            return {
                responseText: responseText,
                metadata: metadata,
                error: null, // No error
                finalRetryCount: 0 // Reset retry count on success
            };

        } catch (error) {
            console.error(`Error calling Gemini API (Stage ${stage}, Attempt ${currentRetryCount + 1}):`, error);
            currentRetryCount++;

            if (currentRetryCount <= MAX_RETRIES) {
                console.log(`Retrying LLM call (Attempt ${currentRetryCount + 1} of ${MAX_RETRIES + 1})...`);
                const delay = 1000 * Math.pow(2, currentRetryCount - 1) + Math.random() * 500; // Exponential backoff with jitter
                await new Promise(resolve => setTimeout(resolve, delay));
                // Continue to next iteration of the while loop
            } else {
                // Max retries exceeded, return error and fallback
                console.log(`Maximum LLM retries (${MAX_RETRIES}) exceeded for stage ${stage}. Falling back.`);
                const fallbackResult = simulateFallbackResponse(queryContext, stage);
                fallbackResult.error = `LLM Error after retries: ${error.message}`; // Add the final error message
                fallbackResult.finalRetryCount = currentRetryCount -1; // Store the final count before failure
                return fallbackResult;
            }
        }
    }

    // Should theoretically not be reached, but as a safeguard:
    console.error(`LLM Analysis loop finished unexpectedly for stage ${stage}. Falling back.`);
    const fallbackResult = simulateFallbackResponse(queryContext, stage);
    fallbackResult.error = "LLM processing failed after retries.";
    fallbackResult.finalRetryCount = currentRetryCount -1;
    return fallbackResult;
}