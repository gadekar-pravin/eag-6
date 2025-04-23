from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import models, os
import decision_making
from memory import load_api_keys, BACKEND_BASE_URL

# --- FastAPI App Setup ---
app = FastAPI(
    title="Recipe Suggester Backend",
    description="Handles recipe suggestions, ingredient analysis, and shopping list delivery.",
    version="1.0.0",
)

# --- CORS Configuration ---
# WARNING: "*" is insecure for production. Replace with your specific extension ID.
# Find your Extension ID: chrome://extensions/ -> Details -> ID
CHROME_EXTENSION_ID = "ooibifbhbdajafidnpcoahjldohaciim" # <<< REPLACE THIS >>>
# origins = [
#     f"chrome-extension://{CHROME_EXTENSION_ID}",
#     # Add other origins if needed (e.g., for local testing with a web UI)
#     # "http://localhost:3000",
# ]

# Allow all for easy local development if needed (less secure)
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Specify allowed origins
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

# --- Startup Event ---
@app.on_event("startup")
async def startup_event():
    """Load API keys when the application starts."""
    print("Backend starting up...")
    load_api_keys()
    os.makedirs("logs", exist_ok=True)
    print(f"Backend running at: {BACKEND_BASE_URL}")
    if CHROME_EXTENSION_ID == "ooibifbhbdajafidnpcoahjldohaciim":
        print("\n *** WARNING: Remember to replace YOUR_CHROME_EXTENSION_ID_HERE in main.py CORS settings! ***\n")


# --- API Endpoints ---

@app.get("/", tags=["Status"])
async def root():
    """Basic status endpoint to check if the backend is running."""
    return {"message": "Recipe Suggester Backend is running"}

@app.post("/find-recipes",
          # response_model=models.FindRecipesResponse,  # Note: Commented out to allow llm_prompt field to pass through
          tags=["Recipes"],
          summary="Find recipes based on ingredients and preferences")
async def find_recipes(request: models.FindRecipesRequest):
    """
    Takes a list of ingredients and optional preferences, returns recipe suggestions.
    """
    try:
        return decision_making.process_find_recipes(request)
    except Exception as e:
        print(f"Unhandled error in /find-recipes: {e}") # Log the error
        raise HTTPException(status_code=500, detail="Internal server error processing recipes.")


@app.post("/get-missing-ingredients",
          # response_model=models.GetMissingIngredientsResponse,  # Note: Commented out to allow llm_prompt field to pass through
          tags=["Ingredients"],
          summary="Get missing ingredients for a selected recipe")
async def get_missing_ingredients(request: models.GetMissingIngredientsRequest):
    """
    Takes a recipe ID/title and user's ingredients, returns missing items.
    Requires `userIngredients` list in the request body.
    """
    try:
        return decision_making.process_get_missing_ingredients(request)
    except Exception as e:
        print(f"Unhandled error in /get-missing-ingredients: {e}") # Log the error
        raise HTTPException(status_code=500, detail="Internal server error processing missing ingredients.")


@app.post("/send-list",
          # response_model=models.SendListResponse,  # Note: Commented out to allow llm_prompt field to pass through
          tags=["Shopping List"],
          summary="Send the shopping list via Telegram or Email")
async def send_list(request: models.SendListRequest):
    """
    Takes delivery method, details, recipe title, and missing ingredients list,
    then sends the list via the specified channel.
    """
    try:
        return decision_making.process_send_list(request)
    except Exception as e:
        print(f"Unhandled error in /send-list: {e}") # Log the error
        raise HTTPException(status_code=500, detail="Internal server error sending shopping list.")


# --- How to Run ---
# 1. Make sure you have an `.env` file with your API keys in the `python_backend` directory.
# 2. Install dependencies: pip install -r requirements.txt
# 3. Run the server: uvicorn main:app --reload --port 8000