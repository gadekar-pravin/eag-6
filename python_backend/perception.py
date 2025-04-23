import requests
import time
import json
import re
import os
from typing import Dict, Any, Optional

from datetime import datetime

from memory import get_api_key, MAX_LLM_RETRIES, get_error_message
# Assuming models defines LLMAnalysisResult and LLMMetadata
from models import LLMAnalysisResult, LLMMetadata


# --- Helper for LLM Retries ---
# Note: Using a simplified retry mechanism here. Real-world might need more robust handling.
def _call_gemini_api_with_retry(prompt: str, api_key: str) -> Dict[str, Any]:
    """Makes call to Gemini API with retry logic."""
    retries = 0
    last_exception = None
    base_url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent'
    url = f"{base_url}?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.6,  # Slightly lower temp for more deterministic reasoning
            "maxOutputTokens": 2048,
        },
        # Add safety settings if needed
        # "safetySettings": [
        #     {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     # other categories
        # ]
    })

    while retries <= MAX_LLM_RETRIES:
        try:
            response = requests.post(url, headers=headers, data=payload, timeout=30)  # 30 sec timeout for LLM

            if response.status_code == 200:
                response_data = response.json()
                # Basic check for blocked content or missing candidates
                if response_data.get("promptFeedback", {}).get("blockReason"):
                    reason = response_data["promptFeedback"]["blockReason"]
                    ratings = response_data.get("promptFeedback", {}).get("safetyRatings", [])
                    raise Exception(f"Gemini request blocked due to: {reason}. Ratings: {ratings}")
                if not response_data.get("candidates"):
                    raise Exception("Gemini response missing candidates.")
                return response_data  # Success
            else:
                # Raise exception for non-200 responses to trigger retry
                error_details = f"Status {response.status_code}"
                try:
                    error_json = response.json()
                    error_details += f": {error_json.get('error', {}).get('message', response.text)}"
                except json.JSONDecodeError:
                    error_details += f": {response.text}"
                raise requests.exceptions.RequestException(error_details, response=response)

        except requests.exceptions.RequestException as e:
            last_exception = e
            retries += 1
            if retries > MAX_LLM_RETRIES:
                print(f"Max LLM retries exceeded. Error: {e}")
                # Return an error structure instead of raising here
                return {"error": {"message": f"LLM API failed after retries: {e}"}}
            wait_time = (2 ** (retries - 1)) * 1.0  # Exponential backoff (1s, 2s, 4s...)
            print(f"LLM call failed ({e}). Retrying in {wait_time:.2f}s...")
            time.sleep(wait_time)
        except Exception as e:  # Catch other potential errors like blocking
            print(f"Non-request exception during LLM call: {e}")
            return {"error": {"message": f"LLM call failed: {e}"}}

    # Should only be reached if loop finishes unexpectedly
    return {"error": {"message": f"LLM API failed after {MAX_LLM_RETRIES} retries: {last_exception}"}}


# --- Prompt Building ---
def build_reasoning_prompt(query: str, stage: int, context: Optional[Dict] = None) -> str:
    reasoning_prompt = f"""
I want you to think step-by-step about this request. First, understand what is being asked. Then, analyze the information available to you. Consider what additional information or API calls might be needed. Explain your thinking process as you go.

When responding to this query, break down the problem into components that require different types of reasoning, and for each component:
1. Identify the type of reasoning required using [REASONING TYPE: X] tags, where X can be one of: ARITHMETIC, RETRIEVAL, COMPARISON, LOGICAL, CAUSAL, ANALOGICAL, CREATIVE, SOCIAL
2. Apply that reasoning type explicitly
3. Explain your conclusion from that reasoning step

Explicitly use these tags throughout your analysis to make your reasoning transparent.

IMPORTANT: When you are uncertain about something, explicitly state your uncertainty using [UNCERTAINTY: X] tags, where X describes what you're uncertain about and your confidence level (low/medium/high). For example: [UNCERTAINTY: I'm moderately confident these are common cooking ingredients, but 'szechuan peppercorns' might be specialized].

If you encounter information that's critical but missing, or if you can't determine something with confidence, use [ERROR: X] tags to flag this, where X describes the issue. For example: [ERROR: Cannot determine ingredient quantities from the provided information].
"""
    if stage == 1:
        reasoning_prompt += """
    **Stage 1: Find Recipes**

    In this stage, your goal is to assist in finding recipe suggestions that match the user's ingredients and preferences (food type and cuisine). You must prioritize the user's preferences in your reasoning and ensure that any suggested recipes or ingredient validations align with these preferences.

    **Reasoning Instructions**:
    - [REASONING TYPE: LOGICAL]: Analyze the user's food type preference (e.g., vegetarian, vegan, gluten-free). Ensure that the ingredients provided are compatible with this preference. For example, if the food type is 'vegan,' flag any non-vegan ingredients like 'cheese' or 'eggs' with [ERROR: Ingredient X is not compatible with vegan preference].
    - [REASONING TYPE: COMPARISON]: Compare the user's cuisine preference (e.g., Italian, Mexican) with the ingredients provided. Assess whether the ingredients are commonly used in that cuisine. If not, note this with [UNCERTAINTY: Ingredient X is uncommon in Y cuisine, confidence medium].
    - [REASONING TYPE: RETRIEVAL]: Assume you will use the Spoonacular API to fetch recipes. Confirm that the API can filter recipes by the specified food type and cuisine. If the cuisine is niche or not well-supported by Spoonacular, flag with [UNCERTAINTY: Spoonacular may not fully support filtering for X cuisine].

    **SELF-CHECK**:
    1. Verify that you've correctly identified all the ingredients provided in the query. Are they plausible cooking ingredients?
    2. Identify the user's food type and cuisine preferences. Are they clear and unambiguous? If not, flag with [ERROR: Ambiguous preferences: X].
    3. Check if any ingredients are incompatible with the food type preference (e.g., meat in a vegetarian preference). Flag with [ERROR: Ingredient X conflicts with food type Y].
    4. Assess whether the ingredients align with the cuisine preference. If they seem unrelated, flag with [UNCERTAINTY: Ingredients may not suit cuisine X].
    5. Confirm that searching for recipes with these ingredients and preferences is appropriate, and that the Spoonacular API is the right tool. If the API cannot filter effectively for the preferences, note [UNCERTAINTY: Spoonacular filtering for X may be limited].

    **ERROR HANDLING**:
    - If ingredients appear invalid or unclear (e.g., non-food items, gibberish), flag with [ERROR: Invalid ingredients provided: X] and suggest clarifications.
    - If preferences seem contradictory (e.g., 'vegan' with 'chicken' listed), flag with [ERROR: Contradictory preferences: X].
    - If some ingredients might not be found in standard recipe databases, mark with [UNCERTAINTY: Ingredient X might be too niche].
    - If the Spoonacular API is unavailable, state [ERROR: Spoonacular tool unavailable] and suggest general recipe ideas based on the ingredients and preferences.
    - If no recipes are found, recommend adding common ingredients suited to the food type and cuisine or broadening preferences.
    """

    elif stage == 2:
        reasoning_prompt += """
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
    - If the API call fails entirely after retries, provide general guidance on common ingredients needed for this type of recipe (use ANALOGICAL reasoning).
"""
    elif stage == 3:
        reasoning_prompt += """
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
    - If uncertain about ingredient measurements or details in the list, mark with [UNCERTAINTY: Details for ingredient X are estimates] and provide your best estimate.
"""
    # Add the actual query/context
    reasoning_prompt += f"""

    Here is the query/context to respond to:
    {query}

    Please structure your response with clearly labeled reasoning types using [REASONING TYPE: X] tags, include your SELF-CHECK section, flag any uncertainties with [UNCERTAINTY: X] tags, mark any errors with [ERROR: X] tags, and then conclude with the most helpful answer or action plan.
    """
    return reasoning_prompt


# --- Metadata Extraction ---
def extract_reasoning_metadata(llm_response: str) -> LLMMetadata:
    metadata = LLMMetadata()
    if not isinstance(llm_response, str):
        metadata.selfCheck = "Invalid input type"
        metadata.errors = "Invalid input type"
        return metadata

    try:
        # Extract self-check section
        self_check_match = re.search(
            r"SELF-CHECK(?::|)\s*([\s\S]*?)(?:\n\n|ERROR HANDLING:|Here is the query|Please structure|\Z)",
            llm_response, re.IGNORECASE)
        metadata.selfCheck = self_check_match.group(
            1).strip() if self_check_match else "No explicit self-check section found."

        # Extract reasoning types used
        reasoning_matches = re.findall(r"\[REASONING TYPE:\s*([A-Z_]+)\]", llm_response, re.IGNORECASE)
        metadata.reasoningTypes = sorted(list(set(reasoning_matches)))

        # Extract uncertainties
        uncertainty_matches = re.findall(r"\[UNCERTAINTY:\s*(.*?)\]", llm_response, re.IGNORECASE)
        metadata.uncertainties = "; ".join(sorted(list(set(match.strip() for match in uncertainty_matches))))

        # Extract errors
        error_matches = re.findall(r"\[ERROR:\s*(.*?)\]", llm_response, re.IGNORECASE)
        metadata.errors = "; ".join(sorted(list(set(match.strip() for match in error_matches))))

        # Extract preference-specific errors or uncertainties
        preference_errors = [e for e in error_matches if 'preference' in e.lower()]
        preference_uncertainties = [u for u in uncertainty_matches if 'preference' in u.lower() or 'cuisine' in u.lower() or 'food type' in u.lower()]
        metadata.errors += f"; Preference-related errors: {'; '.join(preference_errors)}" if preference_errors else ""
        metadata.uncertainties += f"; Preference-related uncertainties: {'; '.join(preference_uncertainties)}" if preference_uncertainties else ""

    except Exception as e:
        print(f"Error parsing LLM metadata: {e}")
        metadata.errors = f"Metadata parsing failed: {e}"
    return metadata


# --- Main Perception Function ---
def run_llm_analysis(query: str, stage: int, context: Optional[Dict] = None) -> LLMAnalysisResult:
    """
    Runs the LLM analysis for a given stage, including prompt building, API call, and metadata extraction.
    """
    api_key = get_api_key('gemini')
    result = LLMAnalysisResult()  # Initialize with defaults

    if not api_key:
        print("Gemini API key missing. Skipping LLM analysis.")
        result.error = get_error_message("MISSING_API_KEY", "Gemini")
        # Optionally generate a basic fallback text/metadata here
        result.response_text = "[Fallback due to missing API key]"
        return result

    prompt = build_reasoning_prompt(query, stage, context)

    # Add the prompt to the result object so it can be returned to the frontend
    result.prompt = prompt

    # Log the complete prompt
    print(f"\n=== COMPLETE LLM PROMPT (Stage {stage}) ===")
    print(prompt)
    print("=======================================\n")

    # Create logs directory if it doesn't exist
    os.makedirs("logs", exist_ok=True)

    # Write to log file in the logs directory
    log_filename = os.path.join("logs", f"llm_prompt_logs_{datetime.now().strftime('%Y%m%d')}.txt")
    try:
        with open(log_filename, "a") as log_file:
            log_file.write(f"\n\n=== COMPLETE LLM PROMPT (Stage {stage}, Time: {datetime.now().isoformat()}) ===\n")
            log_file.write(f"Query: {query}\n")
            log_file.write(f"Context: {json.dumps(context) if context else 'None'}\n\n")
            log_file.write(prompt)
            log_file.write("\n=======================================\n")
    except Exception as e:
        print(f"Error writing to log file: {e}")
        # Continue execution even if logging fails

    raw_response_data = _call_gemini_api_with_retry(prompt, api_key)

    # Also log the response for debugging purposes
    try:
        with open(log_filename, "a") as log_file:
            log_file.write(f"\n=== LLM RESPONSE (Stage {stage}, Time: {datetime.now().isoformat()}) ===\n")
            log_file.write(f"Raw Response: {json.dumps(raw_response_data)}\n")
            log_file.write("=======================================\n")
    except Exception as e:
        print(f"Error writing response to log file: {e}")

    if raw_response_data.get("error"):
        result.error = get_error_message("LLM_FAILURE", raw_response_data["error"].get("message", "Unknown API error"))
        result.response_text = f"[Fallback due to LLM API error: {result.error}]"
        # Optionally generate more sophisticated fallback text based on stage/context
        return result

    # Extract text safely
    try:
        result.response_text = raw_response_data["candidates"][0]["content"]["parts"][0]["text"]
        result.metadata = extract_reasoning_metadata(result.response_text)
        # Promote errors found *within* the LLM text to the main error field for easier checking
        if result.metadata.errors:
            result.error = f"LLM identified issues: {result.metadata.errors}"

    except (KeyError, IndexError, TypeError) as e:
        print(f"Error parsing Gemini response structure: {e}. Response: {raw_response_data}")
        result.error = get_error_message("LLM_FAILURE", f"Invalid response structure: {e}")
        result.response_text = f"[Fallback due to response parsing error: {result.error}]"
        result.metadata = LLMMetadata(errors="Response parsing failed")  # Mark metadata as failed

    return result