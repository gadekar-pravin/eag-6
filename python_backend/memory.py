import os
from dotenv import load_dotenv
from typing import Dict, Final, Optional

# --- Constants ---
MAX_LLM_RETRIES: Final[int] = 2 # Reduced for example
MAX_API_RETRIES: Final[int] = 1 # Reduced for example
BACKEND_BASE_URL: Final[str] = "http://127.0.0.1:8000" # Keep consistent

ERROR_MESSAGES: Final[Dict[str, str]] = {
    "MISSING_API_KEY": "{} API key not configured in backend environment.",
    "SPOONACULAR_ERROR": "Error communicating with Spoonacular: {}",
    "GEMINI_ERROR": "Error communicating with Gemini API: {}",
    "TELEGRAM_ERROR": "Error sending Telegram message: {}",
    "SENDGRID_ERROR": "Error sending email via SendGrid: {}",
    "INVALID_INPUT": "Invalid input provided: {}",
    "NOT_FOUND": "Resource not found: {}",
    "GENERAL_ERROR": "An unexpected backend error occurred: {}",
    "LLM_FAILURE": "LLM analysis failed: {}",
    "INGREDIENT_COMPARISON_FAILED": "Failed to compare ingredients.",
    # Add more specific messages as needed
}

# --- API Key Storage ---
API_KEYS: Dict[str, Optional[str]] = {
    'spoonacular': None,
    'gemini': None,
    'telegram_bot': None,
    'sendgrid': None,
    'sendgrid_sender': None, # Optional verified sender
}

# --- Functions ---
def load_api_keys():
    """Loads API keys from .env file into the API_KEYS dictionary."""
    try:
        load_dotenv()
        API_KEYS['spoonacular'] = os.getenv("SPOONACULAR_API_KEY")
        API_KEYS['gemini'] = os.getenv("GEMINI_API_KEY")
        API_KEYS['telegram_bot'] = os.getenv("TELEGRAM_BOT_API_KEY")
        API_KEYS['sendgrid'] = os.getenv("SENDGRID_API_KEY")
        API_KEYS['sendgrid_sender'] = os.getenv("SENDGRID_SENDER_EMAIL", "recipe-suggester-bot@example.com") # Default or from env

        # Basic validation
        for key, value in API_KEYS.items():
            if key != 'sendgrid_sender' and not value:
                print(f"Warning: API Key for '{key}' is missing in .env file.") # Use proper logging

        print("API Keys loaded from environment.")
    except Exception as e:
        print(f"Error loading .env file or API keys: {e}") # Use proper logging

def get_api_key(key_name: str) -> Optional[str]:
    """Retrieves a specific API key."""
    return API_KEYS.get(key_name)

def get_error_message(key: str, detail: str = "") -> str:
    """Formats an error message."""
    message = ERROR_MESSAGES.get(key, ERROR_MESSAGES["GENERAL_ERROR"])
    return message.format(detail) if detail else message