"""
hand_measurement.py
===================
Run this file FIRST.
It opens your webcam, detects your hand size, and automatically
calls the phone recommender to show your best phone matches.

HOW TO RUN:
    python hand_measurement.py

REQUIREMENTS:
    pip install opencv-python mediapipe pandas openpyxl

DATASET:
    Put  smartphone_dataset_latest.xlsx  in the SAME folder as this file.
"""

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import math
import os
import urllib.request
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG  ← only edit these two lines if needed
# ─────────────────────────────────────────────────────────────────────────────
MODEL_PATH   = "hand_landmarker.task"               # auto-downloaded if missing
DATASET_PATH = "smartphone_dataset_latest.xlsx"     # put xlsx in same folder

# ─────────────────────────────────────────────────────────────────────────────
# USER PREFERENCES  ← edit these to match what YOU want in a phone
# ─────────────────────────────────────────────────────────────────────────────
USER_PREFS = {
    "budget":      40000,   # your max budget in INR
    "camera":      8,       # how much you care about camera  (1–10)
    "battery":     8,       # how much you care about battery (1–10)
    "gaming":      7,       # how much you care about gaming  (1–10)
    "light_phone": True,    # True = prefer phones under 190g
    "prefer_5g":   True,    # True = prefer 5G phones
    "brand":       None,    # e.g. "Samsung" or "Apple", None = no preference
}

# ─────────────────────────────────────────────────────────────────────────────
# DOWNLOAD MODEL IF MISSING
# ─────────────────────────────────────────────────────────────────────────────
if not os.path.exists(MODEL_PATH):
    print("Downloading hand landmarker model (~25 MB) ...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
        "hand_landmarker/float16/1/hand_landmarker.task",
        MODEL_PATH
    )
    print("Model downloaded.\n")

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (5,6),(6,7),(7,8),
    (9,10),(10,11),(11,12),
    (13,14),(14,15),(15,16),
    (17,18),(18,19),(19,20),
    (0,5),(5,9),(9,13),(13,17),(0,17)
]

TIER_COLORS = {
    "XS": (255, 100, 100),
    "S":  (255, 165,   0),
    "S+": (255, 200,  50),
    "M-": (200, 255,  50),
    "M":  (  0, 255, 150),
    "M+": (  0, 220, 255),
    "L":  (  0, 150, 255),
    "L+": (100,  80, 255),
    "XL": (200,   0, 255),
}

SCREEN_RANGES = {
    "XS": (4.7, 5.5),
    "S":  (5.5, 6.0),
    "S+": (5.8, 6.2),
    "M-": (6.1, 6.4),
    "M":  (6.1, 6.5),
    "M+": (6.4, 6.7),
    "L":  (6.5, 6.8),
    "L+": (6.7, 7.0),
    "XL": (7.0, 8.0),
}

HAND_FIT_MAP = {
    "XS":        ["XS"],
    "Small":     ["S",  "S+"],
    "Small-Med": ["S+", "M-"],
    "Medium":    ["M-", "M",  "M+"],
    "Large":     ["L",  "L+", "XL"],
}

# ═════════════════════════════════════════════════════════════════════════════
# PART A — HAND MEASUREMENT FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)


def classify_hand(ratio, span_ratio):
    """
    9-tier classification.
    score = length_ratio * 0.65  +  span_ratio * 0.35
    Returns (size_code, size_label)
    """
    score = (ratio * 0.65) + (span_ratio * 0.35)
    if   score < 1.20: return "XS",  "Extra Small"
    elif score < 1.35: return "S",   "Small"
    elif score < 1.50: return "S+",  "Small Plus"
    elif score < 1.62: return "M-",  "Medium Small"
    elif score < 1.75: return "M",   "Medium"
    elif score < 1.90: return "M+",  "Medium Large"
    elif score < 2.05: return "L",   "Large"
    elif score < 2.20: return "L+",  "Large Plus"
    else:              return "XL",  "Extra Large"


def classify_span(span_ratio):
    if   span_ratio < 1.1: return "Very Narrow"
    elif span_ratio < 1.3: return "Narrow"
    elif span_ratio < 1.5: return "Average"
    elif span_ratio < 1.7: return "Wide"
    else:                  return "Very Wide"


def get_grip_style(size_code, span_type):
    grip_map = {
        ("XS",  "Very Narrow"): "One-Hand Thumb Grip",
        ("XS",  "Narrow"):      "One-Hand Thumb Grip",
        ("S",   "Narrow"):      "One-Hand Grip",
        ("S",   "Average"):     "One-Hand Grip",
        ("S+",  "Average"):     "One-Hand / Cradle Grip",
        ("M-",  "Average"):     "Hybrid Grip",
        ("M-",  "Wide"):        "Hybrid Grip",
        ("M",   "Average"):     "Hybrid Grip",
        ("M",   "Wide"):        "Two-Thumb Grip",
        ("M+",  "Wide"):        "Two-Thumb Grip",
        ("M+",  "Very Wide"):   "Two-Thumb Power Grip",
        ("L",   "Wide"):        "Two-Hand Power Grip",
        ("L",   "Very Wide"):   "Two-Hand Power Grip",
        ("L+",  "Very Wide"):   "Full Palm Grip",
        ("XL",  "Very Wide"):   "Full Palm / Foldable Grip",
    }
    return grip_map.get((size_code, span_type), "Adaptive Grip")

# ═════════════════════════════════════════════════════════════════════════════
# PART B — DRAWING FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def draw_landmarks(img, hand_landmarks, color=(0, 255, 0)):
    h, w, _ = img.shape
    for start_idx, end_idx in HAND_CONNECTIONS:
        x0 = int(hand_landmarks[start_idx].x * w)
        y0 = int(hand_landmarks[start_idx].y * h)
        x1 = int(hand_landmarks[end_idx].x * w)
        y1 = int(hand_landmarks[end_idx].y * h)
        cv2.line(img, (x0, y0), (x1, y1), color, 2)
    for lm in hand_landmarks:
        cx, cy = int(lm.x * w), int(lm.y * h)
        cv2.circle(img, (cx, cy), 5, (255, 255, 255), -1)
        cv2.circle(img, (cx, cy), 5, color, 1)


def draw_measurement_line(img, p1, p2, label, color=(0, 255, 255)):
    h, w, _ = img.shape
    x1, y1 = int(p1.x * w), int(p1.y * h)
    x2, y2 = int(p2.x * w), int(p2.y * h)
    cv2.line(img, (x1, y1), (x2, y2), color, 2)
    mid_x, mid_y = (x1 + x2) // 2, (y1 + y2) // 2
    cv2.putText(img, label, (mid_x + 5, mid_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)


def draw_info_panel(img, hand_label, data, panel_x, panel_y):
    panel_w, panel_h = 305, 230
    overlay = img.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.70, img, 0.30, 0, img)

    tier_color = TIER_COLORS.get(data["size_code"], (255, 255, 255))

    badge_x, badge_y = panel_x + panel_w - 60, panel_y + 8
    cv2.rectangle(img, (badge_x, badge_y),
                  (badge_x + 52, badge_y + 28), tier_color, -1)
    cv2.putText(img, data["size_code"], (badge_x + 5, badge_y + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2)

    cv2.rectangle(img, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), tier_color, 1)

    lines = [
        (f"  {hand_label}",                          (255, 255, 255), 0.60, 2),
        (f"  Size   : {data['size_label']}",          tier_color,      0.55, 1),
        (f"  Span   : {data['span_type']}",           (200, 200, 255), 0.50, 1),
        (f"  L-Ratio: {data['ratio']:.3f}",           (180, 180, 180), 0.48, 1),
        (f"  S-Ratio: {data['span_ratio']:.3f}",      (180, 180, 180), 0.48, 1),
        (f"  Score  : {data['score']:.3f}",           (160, 160, 160), 0.48, 1),
        (f"  Grip   : {data['grip']}",                (255, 200, 100), 0.48, 1),
        (f"  Press S for phone recs",                 (100, 255, 100), 0.45, 1),
    ]
    for idx, (text, color, scale, thickness) in enumerate(lines):
        y = panel_y + 26 + idx * 24
        cv2.putText(img, text, (panel_x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness)

# ═════════════════════════════════════════════════════════════════════════════
# PART C — PHONE RECOMMENDATION FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def load_and_prepare_dataset():
    if not os.path.exists(DATASET_PATH):
        print(f"\n[ERROR] Dataset not found: '{DATASET_PATH}'")
        print("  Make sure smartphone_dataset_latest.xlsx is in the same folder.\n")
        return None

    df = pd.read_excel(DATASET_PATH)

    # Fix Segment column (some rows have stray numeric values)
    valid_seg = {"Budget", "Mid-Range", "Mid-Premium", "Premium", "Ultra-Premium"}
    df["Segment"] = df["Segment"].apply(lambda x: x if x in valid_seg else None)

    # Normalise scores to 0–10
    df["camera_score"]  = (df["Main_Cam_MP"]  / df["Main_Cam_MP"].max())  * 10
    df["battery_score"] = (df["Battery_mAh"]  / df["Battery_mAh"].max())  * 10
    df["gaming_score"]  = df["Refresh_Hz"].map(
        {60: 4, 90: 6, 120: 8, 144: 9, 165: 10}
    ).fillna(5)

    return df


def score_phone(phone, user, screen_range):
    score = 0

    # Screen size fit — 30 pts max
    s = phone["Screen_Inch"]
    if screen_range[0] <= s <= screen_range[1]:
        score += 30
    elif abs(s - screen_range[0]) <= 0.3 or abs(s - screen_range[1]) <= 0.3:
        score += 15
    else:
        score += 5

    # Dataset Hand_Size_Fit cross-check — 10 pts bonus
    fit_codes = HAND_FIT_MAP.get(str(phone["Hand_Size_Fit"]), [])
    if user["preferred_size"] in fit_codes:
        score += 10

    # Budget — 20 pts
    price = phone["Current_Price_INR"]
    if price <= user["budget"]:
        score += 20
    elif price <= user["budget"] * 1.10:
        score += 10
    else:
        score -= 10

    # Camera — 15 pts max
    score += (phone["camera_score"] / 10) * 15 * (user["camera"] / 10)

    # Battery — 15 pts max
    score += (phone["battery_score"] / 10) * 15 * (user["battery"] / 10)

    # Gaming/refresh — 20 pts max
    score += (phone["gaming_score"] / 10) * 20 * (user["gaming"] / 10)

    # Weight bonus — 5 pts
    if user.get("light_phone") and phone["Weight_g"] < 190:
        score += 5

    # Brand preference — 5 pts
    if user.get("brand") and phone["Brand"] == user["brand"]:
        score += 5

    # 5G preference — 5 pts
    if user.get("prefer_5g") and str(phone["5G"]).strip().lower() == "yes":
        score += 5

    return round(score, 2)


def recommend_phones(size_code, size_label, user_prefs):
    """
    Called automatically when user presses S.
    size_code and size_label come from classify_hand() in the webcam loop.
    """
    df = load_and_prepare_dataset()
    if df is None:
        return

    user = user_prefs.copy()
    user["preferred_size"] = size_code      # ← hand size wired in here

    screen_range = SCREEN_RANGES.get(size_code, (6.1, 6.5))

    df["score"] = df.apply(
        lambda row: score_phone(row, user, screen_range), axis=1
    )

    top_5 = df.sort_values(by="score", ascending=False).head(5).reset_index(drop=True)

    print("\n" + "═" * 70)
    print("  📱  TOP 5 PHONE RECOMMENDATIONS")
    print("═" * 70)
    print(f"  Hand Size   : {size_code}  ({size_label})")
    print(f"  Screen Range: {screen_range[0]}\" – {screen_range[1]}\"")
    print(f"  Budget      : ₹{user['budget']:,}")
    print(f"  5G Only     : {user.get('prefer_5g', False)}")
    print(f"  Light Phone : {user.get('light_phone', False)}")
    print("═" * 70)

    for i, row in top_5.iterrows():
        rank_label = ["🥇","🥈","🥉","  4.","  5."][i]
        print(f"\n  {rank_label}  {row['Brand']} {row['Model']}")
        print(f"        Score   : {row['score']}")
        print(f"        Price   : ₹{int(row['Current_Price_INR']):,}")
        print(f"        Screen  : {row['Screen_Inch']}\"   Hand Fit: {row['Hand_Size_Fit']}")
        print(f"        Camera  : {row['Main_Cam_MP']} MP")
        print(f"        Battery : {row['Battery_mAh']} mAh")
        print(f"        Refresh : {row['Refresh_Hz']} Hz")
        print(f"        Weight  : {row['Weight_g']} g")
        print(f"        5G      : {row['5G']}")

    best = top_5.iloc[0]
    print("\n" + "═" * 70)
    print(f"  ✅  BEST PICK: {best['Brand']} {best['Model']}  (Score: {best['score']})")
    print("═" * 70 + "\n")

# ═════════════════════════════════════════════════════════════════════════════
# PART D — MAIN WEBCAM LOOP
# ═════════════════════════════════════════════════════════════════════════════

base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options      = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)
detector     = vision.HandLandmarker.create_from_options(options)

cap = cv2.VideoCapture(0)

print("=" * 50)
print("  Hand Measurement + Phone Recommender")
print("=" * 50)
print("  Show your hand to the camera")
print("  Press S   → get phone recommendations")
print("  Press ESC → quit")
print("=" * 50 + "\n")

# Stores the last detected hand size so S key always works
last_size_code  = "M"
last_size_label = "Medium"

while True:
    success, img = cap.read()
    if not success:
        print("Failed to grab frame.")
        break

    img_rgb  = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    results  = detector.detect(mp_image)

    if results.hand_landmarks:
        for i, hand_landmarks in enumerate(results.hand_landmarks):
            lm = hand_landmarks

            # Measurements
            hand_length = distance(lm[0], lm[12])
            palm_width  = distance(lm[5], lm[17])
            finger_span = distance(lm[4], lm[20])

            ratio      = hand_length / palm_width
            span_ratio = finger_span / palm_width
            score      = (ratio * 0.65) + (span_ratio * 0.35)

            # Classification
            size_code, size_label = classify_hand(ratio, span_ratio)
            span_type             = classify_span(span_ratio)
            grip                  = get_grip_style(size_code, span_type)
            tier_color            = TIER_COLORS.get(size_code, (255, 255, 255))

            # Remember for S key
            last_size_code  = size_code
            last_size_label = size_label

            # Console output
            hand_label = (results.handedness[i][0].display_name
                          if results.handedness else f"Hand {i+1}")
            print(f"[{hand_label}] {size_label} ({size_code}) | "
                  f"Ratio:{ratio:.2f}  SpanR:{span_ratio:.2f}  "
                  f"Score:{score:.2f} | Grip: {grip}")

            # Draw skeleton + measurement lines
            draw_landmarks(img, lm, color=tier_color)
            draw_measurement_line(img, lm[0],  lm[12], "Length", (0, 255, 255))
            draw_measurement_line(img, lm[5],  lm[17], "Palm W", (255, 165,   0))
            draw_measurement_line(img, lm[4],  lm[20], "Span",   (255,   0, 255))

            # Draw info panel (left for first hand, right for second)
            h_img, w_img, _ = img.shape
            panel_x = 10 if i == 0 else w_img - 315
            panel_y = 10

            draw_info_panel(img, hand_label, {
                "size_code":  size_code,
                "size_label": size_label,
                "span_type":  span_type,
                "ratio":      ratio,
                "span_ratio": span_ratio,
                "score":      score,
                "grip":       grip,
            }, panel_x, panel_y)

    cv2.imshow("Hand Measurements + Phone Recommender", img)

    key = cv2.waitKey(1) & 0xFF
    if key == 27:                              # ESC → quit
        break
    elif key in (ord('s'), ord('S')):          # S → phone recommendation
        print(f"\n Scanning for best phones for {last_size_code} ({last_size_label}) hands...")
        recommend_phones(last_size_code, last_size_label, USER_PREFS)

cap.release()
cv2.destroyAllWindows()