# hand_measurements.py
# PURPOSE: From a single image (not webcam), detect the hand
# and return measurements + hand size category.
# This is the file used by the API.

import cv2
import mediapipe as mp
import numpy as np
import math
import os

# -------------------------------------------------------
# NEW MEDIAPIPE IMPORTS
# -------------------------------------------------------
BaseOptions           = mp.tasks.BaseOptions
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

# -------------------------------------------------------
# MODEL PATH
# -------------------------------------------------------
MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "hand_landmarker.task"
)

# -------------------------------------------------------
# CREATE DETECTOR (IMAGE mode — for single photo analysis)
# -------------------------------------------------------
options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_hands=1
)

# -------------------------------------------------------
# HELPER: Distance between two landmark points
# -------------------------------------------------------
# Each landmark has .x and .y as values from 0.0 to 1.0
# (normalized to image size, so distance is also normalized)
# We use ratios later so the actual scale doesn't matter

def distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

# -------------------------------------------------------
# HELPER: Classify hand size from ratio
# -------------------------------------------------------
# ratio = hand_length / palm_width
# These thresholds were determined by testing

def classify_hand_size(ratio):
    if ratio < 1.5:
        return "Small"
    elif ratio < 1.8:
        return "Medium"
    else:
        return "Large"

# -------------------------------------------------------
# MAIN FUNCTION: Analyze hand from image bytes
# -------------------------------------------------------
# Input:  image as bytes (from file upload or file read)
# Output: dictionary with hand_size + all measurements
#         OR None if no hand was detected

def analyze_hand_from_bytes(image_bytes: bytes):
    
    # Convert bytes → numpy array → decode as image
    np_arr  = np.frombuffer(image_bytes, np.uint8)
    bgr_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if bgr_img is None:
        return None  # couldn't read the image
    
    # MediaPipe needs RGB (OpenCV loads as BGR, so we convert)
    rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
    
    # Wrap in MediaPipe Image object
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)
    
    # Run detection
    with HandLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp_image)
    
    # If no hand found, return None
    if not result.hand_landmarks:
        return None
    
    # Get the 21 landmarks of the first detected hand
    # lm is a list of 21 objects, each with .x and .y
    lm = result.hand_landmarks[0]
    
    # -------------------------------------------------------
    # CALCULATE MEASUREMENTS
    # -------------------------------------------------------
    # Landmark index reference:
    #  0 = Wrist
    #  4 = Thumb tip
    #  5 = Index finger base (MCP joint)
    #  8 = Index finger tip
    # 12 = Middle finger tip
    # 17 = Pinky base (MCP joint)
    # 20 = Pinky tip
    
    hand_length  = distance(lm[0],  lm[12])  # wrist → middle tip
    palm_width   = distance(lm[5],  lm[17])  # index base → pinky base
    finger_span  = distance(lm[4],  lm[20])  # thumb tip → pinky tip
    
    # Use ratio so results don't depend on how close hand is to camera
    ratio = hand_length / palm_width if palm_width > 0 else 1.5
    
    hand_size = classify_hand_size(ratio)
    
    # Include raw landmarks so the frontend can draw them
    landmarks = [{"x": lm.x, "y": lm.y} for lm in lm]

    return {
        "hand_size":    hand_size,
        "ratio":        round(ratio, 3),
        "hand_length":  round(hand_length, 4),
        "palm_width":   round(palm_width, 4),
        "finger_span":  round(finger_span, 4),
        "landmarks":    landmarks,        # ← 21 points for drawing
    }


# -------------------------------------------------------
# TEST: Run this file directly to test with an image file
# -------------------------------------------------------
# Usage: python vision/hand_measurements.py
# (It will try to load a test image from the project root)

if __name__ == "__main__":
    test_image_path = "test_hand.jpg"  # put any hand photo here
    
    if not os.path.exists(test_image_path):
        print(f"No test image found at '{test_image_path}'")
        print("Put a hand photo named test_hand.jpg in your project root and run again.")
    else:
        with open(test_image_path, "rb") as f:
            result = analyze_hand_from_bytes(f.read())
        
        if result:
            print("Hand detected!")
            print(f"  Hand size  : {result['hand_size']}")
            print(f"  Ratio      : {result['ratio']}")
            print(f"  Hand length: {result['hand_length']}")
            print(f"  Palm width : {result['palm_width']}")
            print(f"  Finger span: {result['finger_span']}")
        else:
            print("No hand detected. Try a clearer photo with good lighting.")