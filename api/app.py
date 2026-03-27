# api/app.py
# PURPOSE: The web server that connects everything.
# The frontend sends requests here, we return results.
# Run with: uvicorn api.app:app --reload

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import our own modules
from recommender.phone_recommender import get_recommendations, get_screen_range
from vision.hand_measurements import analyze_hand_from_bytes

# -------------------------------------------------------
# CREATE THE APP
# -------------------------------------------------------
app = FastAPI(title="SmartPhone Hand Recommender API")

# -------------------------------------------------------
# CORS — allows the React frontend to talk to this API
# -------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# DATA MODEL — defines what the /recommend route expects
# -------------------------------------------------------
class UserPreferences(BaseModel):
    budget:    int   # example: 40000
    camera:    int   # 1 to 10
    battery:   int   # 1 to 10
    gaming:    int   # 1 to 10
    hand_size: str   # "Small", "Medium", or "Large"

# -------------------------------------------------------
# ROUTE 1: Health check
# -------------------------------------------------------
# Visit http://127.0.0.1:8000 to confirm the server is alive

@app.get("/")
def home():
    return {"message": "SmartPhone Hand Recommender API is running!"}

# -------------------------------------------------------
# ROUTE 2: Analyze a hand image
# -------------------------------------------------------
# The frontend uploads a photo of a hand.
# We run MediaPipe on it and return the hand size.
#
# Method : POST
# URL    : /analyze-hand
# Input  : image file (jpg/png)
# Output : hand_size, ratio, measurements

@app.post("/analyze-hand")
async def analyze_hand(file: UploadFile = File(...)):
    
    # Reject non-image files early
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file (jpg or png)."
        )
    
    # Read the uploaded file as bytes
    image_bytes = await file.read()
    
    # Run hand analysis using our vision module
    result = analyze_hand_from_bytes(image_bytes)
    
    # If no hand was found in the image
    if result is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "No hand detected. Try again with: "
                "good lighting, flat open palm facing the camera, "
                "plain background."
            )
        )
    
    # Add the recommended screen size range to the response
    screen = get_screen_range(result["hand_size"])
    result["recommended_screen_min"] = screen[0]
    result["recommended_screen_max"] = screen[1]
    
    return result

# -------------------------------------------------------
# ROUTE 3: Get phone recommendations
# -------------------------------------------------------
# After hand analysis, the frontend sends user preferences.
# We score every phone in the dataset and return top 5.
#
# Method : POST
# URL    : /recommend
# Input  : budget, camera, battery, gaming, hand_size
# Output : best_phone + top_5 list

@app.post("/recommend")
def recommend(prefs: UserPreferences):
    
    user_prefs = {
        "budget":  prefs.budget,
        "camera":  prefs.camera,
        "battery": prefs.battery,
        "gaming":  prefs.gaming
    }
    
    result = get_recommendations(prefs.hand_size, user_prefs)
    return result

# -------------------------------------------------------
# ROUTE 4: Quick hand size check (no image needed)
# -------------------------------------------------------
# Just pass a ratio number and get the hand size back.
# Useful for testing without uploading an image.
# Example: http://127.0.0.1:8000/classify-hand/1.7

@app.get("/classify-hand/{ratio}")
def classify_hand(ratio: float):
    
    if ratio < 1.5:
        hand_size = "Small"
    elif ratio < 1.8:
        hand_size = "Medium"
    else:
        hand_size = "Large"
    
    screen = get_screen_range(hand_size)
    
    return {
        "hand_size":              hand_size,
        "recommended_screen_min": screen[0],
        "recommended_screen_max": screen[1]
    }