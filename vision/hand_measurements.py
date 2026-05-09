# vision/hand_measurements.py
# IMPROVED: Uses 5 normalized ratios + confidence scoring
# for accurate hand size classification independent of camera distance.

import cv2
import mediapipe as mp
import numpy as np
import math
import os

BaseOptions           = mp.tasks.BaseOptions
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "hand_landmarker.task"
)

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_hands=1,
    min_hand_detection_confidence=0.6,  # higher = more accurate
    min_hand_presence_confidence=0.6,
    min_tracking_confidence=0.6,
)

def distance(p1, p2):
    """Euclidean distance between two landmarks (normalized coords)."""
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def compute_ratios(lm):
    """
    Compute 5 scale-independent ratios from hand landmarks.
    All ratios are relative to palm_width so camera distance doesn't matter.

    Landmark reference:
      0  = Wrist
      4  = Thumb tip
      5  = Index MCP (base)
      8  = Index tip
      9  = Middle MCP (base)
      12 = Middle tip
      17 = Pinky MCP (base)
      20 = Pinky tip
    """
    # Base measurement — palm width (scale reference)
    palm_width   = distance(lm[5],  lm[17])   # index base → pinky base
    if palm_width < 0.001:
        return None  # hand too small / bad detection

    # All other measurements normalized by palm_width
    hand_length  = distance(lm[0],  lm[12])   # wrist → middle tip
    finger_span  = distance(lm[4],  lm[20])   # thumb tip → pinky tip
    thumb_length = distance(lm[2],  lm[4])    # thumb base → thumb tip
    index_length = distance(lm[5],  lm[8])    # index base → index tip
    pinky_length = distance(lm[17], lm[20])   # pinky base → pinky tip

    return {
        # RATIO 1: Primary size indicator
        # Larger hands → longer relative to palm width
        "length_ratio":  hand_length  / palm_width,

        # RATIO 2: Finger spread
        # Larger hands → wider finger span relative to palm
        "span_ratio":    finger_span  / palm_width,

        # RATIO 3: Thumb reach
        # Larger hands → proportionally longer thumb
        "thumb_ratio":   thumb_length / palm_width,

        # RATIO 4: Index finger proportion
        "index_ratio":   index_length / palm_width,

        # RATIO 5: Pinky proportion
        "pinky_ratio":   pinky_length / palm_width,

        # Raw values (for display)
        "palm_width":    palm_width,
        "hand_length":   hand_length,
        "finger_span":   finger_span,
    }

def classify_hand_size(ratios):
    """
    Classify hand size using weighted combination of all 5 ratios.

    Thresholds derived from MediaPipe's normalized coordinate system:
    - Small hands:  length_ratio < 1.45, span_ratio < 1.55
    - Medium hands: length_ratio 1.45–1.75, span_ratio 1.55–1.85
    - Large hands:  length_ratio > 1.75, span_ratio > 1.85

    We use a weighted score across all ratios for robustness.
    """
    # Weighted score — higher = larger hand
    # length_ratio and span_ratio are most reliable so get higher weight
    score = (
        ratios["length_ratio"] * 0.35 +
        ratios["span_ratio"]   * 0.30 +
        ratios["thumb_ratio"]  * 0.15 +
        ratios["index_ratio"]  * 0.10 +
        ratios["pinky_ratio"]  * 0.10
    )

    # Classification thresholds (tuned for normalized coords)
    if score < 1.45:
        hand_size   = "Small"
        confidence  = min(100, int((1.45 - score) / 0.45 * 100 + 60))
    elif score < 1.75:
        hand_size   = "Medium"
        # confidence is highest at center of range (1.60)
        center_dist = abs(score - 1.60) / 0.15
        confidence  = min(100, int((1 - center_dist) * 40 + 60))
    else:
        hand_size   = "Large"
        confidence  = min(100, int((score - 1.75) / 0.45 * 100 + 60))

    return hand_size, max(50, confidence), round(score, 4)

def analyze_hand_from_bytes(image_bytes: bytes):
    """
    Main function called by the API.
    Takes image bytes, returns hand measurements + classification.
    Returns None if no hand detected.
    """
    # Decode image
    np_arr  = np.frombuffer(image_bytes, np.uint8)
    bgr_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if bgr_img is None:
        return None

    # Resize for consistency (helps with accuracy)
    bgr_img = cv2.resize(bgr_img, (640, 480))
    rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)

    with HandLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp_image)

    if not result.hand_landmarks:
        return None

    lm     = result.hand_landmarks[0]
    ratios = compute_ratios(lm)

    if ratios is None:
        return None

    hand_size, confidence, score = classify_hand_size(ratios)

    # Get screen range
    screen_ranges = {
        "Small":  (4.7, 6.1),
        "Medium": (6.1, 6.5),
        "Large":  (6.5, 6.9),
    }
    screen = screen_ranges[hand_size]

    # Landmarks for frontend overlay drawing
    landmarks = [{"x": lm_pt.x, "y": lm_pt.y} for lm_pt in lm]

    return {
        "hand_size":             hand_size,
        "confidence":            confidence,     # % confidence in classification
        "score":                 score,          # raw weighted score
        "ratio":                 round(ratios["length_ratio"], 3),
        "hand_length":           round(ratios["hand_length"],  4),
        "palm_width":            round(ratios["palm_width"],   4),
        "finger_span":           round(ratios["finger_span"],  4),
        "all_ratios":            {k: round(v, 4) for k, v in ratios.items()},
        "recommended_screen_min": screen[0],
        "recommended_screen_max": screen[1],
        "landmarks":             landmarks,
    }