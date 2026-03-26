# FastAPI is the web framework - it handles incoming requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# BaseModel is used to define what data we expect from the frontend
from pydantic import BaseModel

# Our own recommendation logic
from recommender.phone_recommender import get_recommendations, get_screen_range

# For image processing (hand scan)
import cv2
import mediapipe as mp
import numpy as np
import math
import io
from PIL import Image

# -------------------------------------------------------
# CREATE THE APP
# -------------------------------------------------------
# This one line creates your entire web server
app = FastAPI(title="SmartPhone Hand Recommender API")

# -------------------------------------------------------
# CORS SETUP
# -------------------------------------------------------
# CORS means "Cross-Origin Resource Sharing"
# Without this, your React frontend CANNOT talk to this API
# (browsers block it for security reasons by default)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # allow requests from anywhere
    allow_credentials=True,
    allow_methods=["*"],       # allow GET, POST, etc.
    allow_headers=["*"],
)

# -------------------------------------------------------
# MEDIAPIPE SETUP (for hand detection)
# -------------------------------------------------------
mp_hands = mp.solutions.hands
hands_detector = mp_hands.Hands(
    static_image_mode=True,    # we're processing single images, not video
    max_num_hands=1,           # we only need one hand
    min_detection_confidence=0.5
)

# -------------------------------------------------------
# DATA MODELS
# -------------------------------------------------------
# These tell FastAPI exactly what shape the data should be
# when the frontend sends a request

class UserPreferences(BaseModel):
    budget: int          # e.g. 40000
    camera: int          # 1-10 scale
    battery: int         # 1-10 scale
    gaming: int          # 1-10 scale
    hand_size: str       # "Small", "Medium", or "Large"

# -------------------------------------------------------
# HELPER: Calculate hand measurements from image
# -------------------------------------------------------
def distance(p1, p2):
    """Calculate distance between two MediaPipe landmark points"""
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def analyze_hand_image(image_bytes):
    """
    Takes an image as bytes, runs MediaPipe on it,
    and returns the hand size category.
    
    Returns: dict with hand_size and measurements
    """
    # Convert bytes → PIL Image → numpy array (OpenCV format)
    pil_image = Image.open(io.BytesIO(image_bytes))
    pil_image = pil_image.convert("RGB")
    frame = np.array(pil_image)
    
    # MediaPipe needs RGB format
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    rgb_frame = cv2.cvtColor(rgb_frame, cv2.COLOR_BGR2RGB)
    
    # Process with MediaPipe
    results = hands_detector.process(rgb_frame)
    
    if not results.multi_hand_landmarks:
        return None  # No hand detected
    
    # Get the first hand's landmarks
    lm = results.multi_hand_landmarks[0].landmark
    
    # Calculate measurements using landmark points:
    # lm[0]  = Wrist
    # lm[12] = Middle finger tip
    # lm[5]  = Index finger base
    # lm[17] = Pinky finger base
    # lm[4]  = Thumb tip
    # lm[20] = Pinky tip
    
    hand_length = distance(lm[0], lm[12])   # wrist to middle tip
    palm_width  = distance(lm[5], lm[17])   # index base to pinky base
    finger_span = distance(lm[4], lm[20])   # thumb tip to pinky tip
    
    # Normalize: use ratios so distance from camera doesn't matter
    ratio = hand_length / palm_width if palm_width > 0 else 1.5
    
    # Classify hand size
    if ratio < 1.5:
        hand_size = "Small"
    elif ratio < 1.8:
        hand_size = "Medium"
    else:
        hand_size = "Large"
    
    screen_range = get_screen_range(hand_size)
    
    return {
        "hand_size": hand_size,
        "ratio": round(ratio, 3),
        "hand_length": round(hand_length, 4),
        "palm_width": round(palm_width, 4),
        "finger_span": round(finger_span, 4),
        "recommended_screen_min": screen_range[0],
        "recommended_screen_max": screen_range[1]
    }

# -------------------------------------------------------
# ROUTE 1: Home (just to check the API is alive)
# -------------------------------------------------------
# Visit http://127.0.0.1:8000 in browser to see this
@app.get("/")
def home():
    return {"message": "SmartPhone Hand Recommender API is running!"}

# -------------------------------------------------------
# ROUTE 2: Analyze hand image
# -------------------------------------------------------
# Frontend sends an image, we return the hand size
# 
# Method: POST (we're sending data TO the server)
# Endpoint: /analyze-hand
# Input: image file
# Output: hand size + measurements

@app.post("/analyze-hand")
async def analyze_hand(file: UploadFile = File(...)):
    """
    Upload a hand image.
    Returns hand size (Small/Medium/Large) and measurements.
    """
    # Check it's actually an image
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    
    # Read the image bytes
    image_bytes = await file.read()
    
    # Analyze it
    result = analyze_hand_image(image_bytes)
    
    if result is None:
        raise HTTPException(
            status_code=422, 
            detail="No hand detected in the image. Please take a clearer photo of your hand."
        )
    
    return result

# -------------------------------------------------------
# ROUTE 3: Get phone recommendations
# -------------------------------------------------------
# Frontend sends user preferences + hand size
# We return top 5 phones + best pick
#
# Method: POST
# Endpoint: /recommend
# Input: budget, camera, battery, gaming, hand_size
# Output: best_phone + top_5 list

@app.post("/recommend")
def recommend(prefs: UserPreferences):
    """
    Given user preferences and hand size,
    returns top 5 phone recommendations and the best pick.
    """
    user_prefs = {
        "budget": prefs.budget,
        "camera": prefs.camera,
        "battery": prefs.battery,
        "gaming": prefs.gaming
    }
    
    result = get_recommendations(prefs.hand_size, user_prefs)
    return result

# -------------------------------------------------------
# ROUTE 4: Manual hand size (no image needed)
# -------------------------------------------------------
# If user doesn't want to upload an image, they can type
# their ratio manually and get the hand size

@app.get("/classify-hand/{ratio}")
def classify_hand(ratio: float):
    """
    Classify hand size from a ratio value.
    Example: /classify-hand/1.7
    """
    if ratio < 1.5:
        hand_size = "Small"
    elif ratio < 1.8:
        hand_size = "Medium"
    else:
        hand_size = "Large"
    
    screen_range = get_screen_range(hand_size)
    
    return {
        "hand_size": hand_size,
        "recommended_screen_min": screen_range[0],
        "recommended_screen_max": screen_range[1]
    }