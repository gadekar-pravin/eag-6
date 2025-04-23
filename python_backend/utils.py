import re
from typing import List
# Assuming models defines SpoonacularIngredient
from models import SpoonacularIngredient

def normalize_ingredient(name: str) -> str:
    """Simple normalization for ingredient matching."""
    if not name: return ""
    # Lowercase, remove punctuation, handle plurals simply
    name = name.lower()
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    # Simple pluralization removal (add more rules if needed)
    if name.endswith('es'): name = name[:-2]
    elif name.endswith('s'): name = name[:-1]
    return name

def find_missing_ingredients(
    required_ingredients: List[SpoonacularIngredient],
    user_ingredients: List[str]
) -> List[SpoonacularIngredient]:
    """Compares required ingredients with user's list and returns missing ones."""
    missing = []
    normalized_user_ingredients = {normalize_ingredient(ing) for ing in user_ingredients if ing}

    for req_ing in required_ingredients:
        if not req_ing or not req_ing.name: continue

        normalized_req = normalize_ingredient(req_ing.name)
        if not normalized_req: continue

        found = False
        # Direct match
        if normalized_req in normalized_user_ingredients:
            found = True
        # Partial match (e.g., "onion" in "red onion" or vice-versa)
        else:
            for user_ing_norm in normalized_user_ingredients:
                if not user_ing_norm: continue
                # Check if one contains the other (simple substring check)
                if normalized_req in user_ing_norm or user_ing_norm in normalized_req:
                    found = True
                    break
                # TODO: Add more sophisticated matching (e.g., word overlap, stemming)

        if not found:
            missing.append(req_ing)

    print(f"Ingredient comparison: Required={len(required_ingredients)}, User={len(user_ingredients)}, Missing={len(missing)}")
    return missing