# api/app.py
#
# PURPOSE: Web server that connects everything together.
# Run with: uvicorn api.app:app --reload
#
# Routes:
#   GET  /                      → health check
#   GET  /classify-hand/{ratio} → quick hand size test (no image needed)
#   POST /analyze-hand          → upload hand image → get hand size
#   POST /recommend             → send preferences → get top 5 phones

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import traceback

from recommender.phone_recommender import get_recommendations, get_screen_range
from vision.hand_measurements import analyze_hand_from_bytes

# -------------------------------------------------------
# CREATE THE APP
# -------------------------------------------------------
app = FastAPI(title="SmartPhone Hand Recommender API")

# -------------------------------------------------------
# CORS — allows the React frontend to call this API
# Without this, browsers block cross-origin requests
# -------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------
# DATA MODEL for /recommend
# -------------------------------------------------------
# Pydantic automatically validates types and gives a clear
# error if the frontend sends wrong data

class UserPreferences(BaseModel):
    budget:    int    # in Indian Rupees, e.g. 40000
    camera:    int    # importance 1–10
    battery:   int    # importance 1–10
    gaming:    int    # importance 1–10
    hand_size: str    # "Small", "Medium", or "Large"


# -------------------------------------------------------
# ROUTE 1: Health check
# -------------------------------------------------------
@app.get("/")
def home():
    return {"message": "SmartPhone Hand Recommender API is running!"}


# -------------------------------------------------------
# ROUTE 2: Quick hand size test (no image needed)
# -------------------------------------------------------
# Pass any ratio value and get hand size back.
# Example: http://127.0.0.1:8000/classify-hand/1.7
# Use this to confirm the API is working before testing images.

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
        "recommended_screen_max": screen[1],
    }


# -------------------------------------------------------
# ROUTE 3: Analyze a hand image
# -------------------------------------------------------
# Upload a photo of your hand.
# Returns hand size + measurements from MediaPipe.
#
# Tips for a good photo:
#   - Good lighting (no shadows on palm)
#   - Flat open hand facing the camera
#   - Plain background (white/light surface works best)

@app.post("/analyze-hand")
async def analyze_hand(file: UploadFile = File(...)):
    try:
        if not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Please upload a jpg or png image."
            )

        image_bytes = await file.read()
        result = analyze_hand_from_bytes(image_bytes)

        if result is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No hand detected in the photo. "
                    "Try: flat open palm, good lighting, plain background."
                )
            )

        # Add screen size recommendation to the response
        screen = get_screen_range(result["hand_size"])
        result["recommended_screen_min"] = screen[0]
        result["recommended_screen_max"] = screen[1]

        return result

    except HTTPException:
        raise
    except Exception as e:
        print("\n--- ERROR in /analyze-hand ---")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "detail": traceback.format_exc()}
        )


# -------------------------------------------------------
# ROUTE 4: Get phone recommendations
# -------------------------------------------------------
# Send user preferences + hand_size.
# Returns best phone + top 5 ranked list.
#
# Example request body:
# {
#   "budget": 40000,
#   "camera": 8,
#   "battery": 9,
#   "gaming": 7,
#   "hand_size": "Medium"
# }

@app.post("/recommend")
def recommend(prefs: UserPreferences):
    try:
        user_prefs = {
            "budget":  prefs.budget,
            "camera":  prefs.camera,
            "battery": prefs.battery,
            "gaming":  prefs.gaming,
        }
        result = get_recommendations(prefs.hand_size, user_prefs)
        return result

    except FileNotFoundError as e:
        # Dataset file missing
        return JSONResponse(
            status_code=500,
            content={
                "error": "Dataset not found",
                "detail": str(e),
                "fix": "Make sure phones_clean.csv is inside your dataset/ folder."
            }
        )
    except Exception as e:
        print("\n--- ERROR in /recommend ---")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "detail": traceback.format_exc()}
        )