from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

# --- Internal Models ---
class IngredientDetail(BaseModel):
    id: Optional[int] = None
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None
    is_estimate: Optional[bool] = False  # To flag fallback ingredients

class SpoonacularIngredient(BaseModel):
    id: int
    amount: float
    unit: str
    name: str
    original: str
    # Add other fields if needed from Spoonacular response

class RecipeSummary(BaseModel):
    id: int
    title: str
    image: Optional[str] = None
    usedIngredientCount: Optional[int] = 0
    missedIngredientCount: Optional[int] = 0

# --- API Request/Response Models ---

# /find-recipes
class FindRecipesRequest(BaseModel):
    ingredients: str
    foodType: Optional[str] = 'any'
    cuisine: Optional[str] = 'any'

class FindRecipesResponse(BaseModel):
    recipes: Optional[List[RecipeSummary]] = None
    error: Optional[str] = None
    llm_prompt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Added metadata field

# /get-missing-ingredients
class GetMissingIngredientsRequest(BaseModel):
    recipeId: int
    recipeTitle: str
    userIngredients: List[str]  # List of ingredient names the user has

class GetMissingIngredientsResponse(BaseModel):
    missingIngredients: Optional[List[IngredientDetail]] = None
    isEstimate: bool = False
    error: Optional[str] = None
    llm_prompt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Added metadata field

# /send-list
class SendListRequest(BaseModel):
    deliveryMethod: Literal['telegram', 'email']
    deliveryDetails: str  # Chat ID or Email Address
    recipeTitle: str
    missingIngredients: List[IngredientDetail]

class SendListResponse(BaseModel):
    success: bool
    message: str  # Confirmation or error message
    llm_prompt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Added metadata field

# --- LLM Interaction Models (Optional, for internal clarity) ---
class LLMMetadata(BaseModel):
    selfCheck: str = "Not performed"
    reasoningTypes: List[str] = []
    uncertainties: str = ""
    errors: str = ""

class LLMAnalysisResult:
    def __init__(self, response_text="", metadata=None, error=None, final_retry_count=0, prompt=None):
        self.response_text = response_text
        self.metadata = metadata or LLMMetadata()
        self.error = error
        self.final_retry_count = final_retry_count
        self.prompt = prompt  # Store the prompt