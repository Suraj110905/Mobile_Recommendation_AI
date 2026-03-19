import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import math
import os
import urllib.request

# Download model if not present
MODEL_PATH = "hand_landmarker.task"
if not os.path.exists(MODEL_PATH):
    print("Downloading hand landmarker model...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        MODEL_PATH
    )
    print("Model downloaded.")

# Hand connections for drawing
HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (5,6),(6,7),(7,8),
    (9,10),(10,11),(11,12),
    (13,14),(14,15),(15,16),
    (17,18),(18,19),(19,20),
    (0,5),(5,9),(9,13),(13,17),(0,17)
]

# ── Classification & Recommendation ──────────────────────────────────────────

def distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def classify_hand(ratio, span_ratio):
    """
    9-tier classification using both length ratio and span ratio
    for maximum accuracy.

    Length Ratio  = hand_length / palm_width
    Span Ratio    = finger_span / palm_width

    Tiers:
      XS  → Extra Small
      S   → Small
      S+  → Small Plus
      M-  → Medium Small
      M   → Medium
      M+  → Medium Large
      L   → Large
      L+  → Large Plus
      XL  → Extra Large
    """
    # Combined score: weight length ratio more than span
    score = (ratio * 0.65) + (span_ratio * 0.35)

    if score < 1.20:
        return "XS",  "Extra Small"
    elif score < 1.35:
        return "S",   "Small"
    elif score < 1.50:
        return "S+",  "Small Plus"
    elif score < 1.62:
        return "M-",  "Medium Small"
    elif score < 1.75:
        return "M",   "Medium"
    elif score < 1.90:
        return "M+",  "Medium Large"
    elif score < 2.05:
        return "L",   "Large"
    elif score < 2.20:
        return "L+",  "Large Plus"
    else:
        return "XL",  "Extra Large"

def classify_span(span_ratio):
    if span_ratio < 1.1:
        return "Very Narrow"
    elif span_ratio < 1.3:
        return "Narrow"
    elif span_ratio < 1.5:
        return "Average"
    elif span_ratio < 1.7:
        return "Wide"
    else:
        return "Very Wide"

def recommend_screen(size_code):
    """
    Maps all 9 hand tiers to screen sizes and phone examples.
    """
    recommendations = {
        "XS": {
            "screen": "Under 5.5 inches",
            "phones": ["iPhone SE (3rd Gen)", "Samsung Galaxy S23 FE", "Pixel 6a"],
            "note":   "Compact phones best"
        },
        "S": {
            "screen": "5.5 - 6.0 inches",
            "phones": ["iPhone 15",           "Samsung Galaxy A54",    "Pixel 7"],
            "note":   "Standard compact"
        },
        "S+": {
            "screen": "5.8 - 6.2 inches",
            "phones": ["iPhone 15",           "Samsung Galaxy S23",    "Pixel 7"],
            "note":   "Slight stretch okay"
        },
        "M-": {
            "screen": "6.1 - 6.4 inches",
            "phones": ["iPhone 15 Plus",      "Samsung Galaxy S23+",   "Pixel 7 Pro"],
            "note":   "Mid-range comfort"
        },
        "M": {
            "screen": "6.1 - 6.5 inches",
            "phones": ["iPhone 15 Plus",      "Samsung Galaxy S23+",   "Pixel 8 Pro"],
            "note":   "Most versatile range"
        },
        "M+": {
            "screen": "6.4 - 6.7 inches",
            "phones": ["iPhone 15 Pro Max",   "Samsung Galaxy S24+",   "Pixel 8 Pro"],
            "note":   "Large standard phones"
        },
        "L": {
            "screen": "6.5 - 6.8 inches",
            "phones": ["iPhone 15 Pro Max",   "Samsung Galaxy S24 Ultra", "OnePlus 12"],
            "note":   "Full-size flagships"
        },
        "L+": {
            "screen": "6.7 - 7.0 inches",
            "phones": ["Samsung Galaxy S24 Ultra", "Xiaomi 14 Ultra",  "Asus ROG Phone 8"],
            "note":   "Max standard phones"
        },
        "XL": {
            "screen": "7.0+ inches (Foldable)",
            "phones": ["Samsung Galaxy Z Fold 6", "OnePlus Open",      "Pixel Fold"],
            "note":   "Foldables ideal"
        },
    }
    return recommendations.get(size_code, {
        "screen": "Unknown", "phones": ["N/A", "N/A", "N/A"], "note": ""
    })

def get_grip_style(size_code, span_type):
    """Grip recommendation based on tier + span."""
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

# ── Color per tier ────────────────────────────────────────────────────────────

TIER_COLORS = {
    "XS": (255, 100, 100),   # light red
    "S":  (255, 165,   0),   # orange
    "S+": (255, 200,  50),   # yellow-orange
    "M-": (200, 255,  50),   # yellow-green
    "M":  (  0, 255, 150),   # green
    "M+": (  0, 220, 255),   # cyan
    "L":  (  0, 150, 255),   # blue
    "L+": (100,  80, 255),   # indigo
    "XL": (200,   0, 255),   # purple
}

# ── Drawing Helpers ───────────────────────────────────────────────────────────

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
    panel_w, panel_h = 300, 260
    overlay = img.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.70, img, 0.30, 0, img)

    tier_color = TIER_COLORS.get(data["size_code"], (255, 255, 255))

    # Tier badge
    badge_x, badge_y = panel_x + panel_w - 60, panel_y + 8
    cv2.rectangle(img, (badge_x, badge_y), (badge_x + 52, badge_y + 28), tier_color, -1)
    cv2.putText(img, data["size_code"], (badge_x + 5, badge_y + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2)

    cv2.rectangle(img, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), tier_color, 1)

    lines = [
        (f"  {hand_label}",                                    (255, 255, 255), 0.60, 2),
        (f"  Size    : {data['size_label']}",                  tier_color,      0.55, 1),
        (f"  Span    : {data['span_type']}",                   (200, 200, 255), 0.50, 1),
        (f"  L-Ratio : {data['ratio']:.3f}",                   (180, 180, 180), 0.48, 1),
        (f"  S-Ratio : {data['span_ratio']:.3f}",              (180, 180, 180), 0.48, 1),
        (f"  Score   : {data['score']:.3f}",                   (160, 160, 160), 0.48, 1),
        (f"  Screen  : {data['screen']}",                      (0, 255, 255),   0.50, 1),
        (f"  Grip    : {data['grip']}",                        (255, 200, 100), 0.48, 1),
        (f"  {data['phones'][0]}",                             (130, 200, 130), 0.45, 1),
        (f"  {data['phones'][1]}",                             (130, 200, 130), 0.45, 1),
        (f"  Note    : {data['note']}",                        (120, 120, 180), 0.43, 1),
    ]

    for idx, (text, color, scale, thickness) in enumerate(lines):
        y = panel_y + 26 + idx * 22
        cv2.putText(img, text, (panel_x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness)

# ── Setup Detector ────────────────────────────────────────────────────────────

base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)
detector = vision.HandLandmarker.create_from_options(options)

cap = cv2.VideoCapture(0)
print("Press ESC to quit.")

# ── Main Loop ─────────────────────────────────────────────────────────────────

while True:
    success, img = cap.read()
    if not success:
        print("Failed to grab frame.")
        break

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    results = detector.detect(mp_image)

    if results.hand_landmarks:
        for i, hand_landmarks in enumerate(results.hand_landmarks):
            lm = hand_landmarks

            # ── Measurements ──
            hand_length  = distance(lm[0], lm[12])
            palm_width   = distance(lm[5], lm[17])
            finger_span  = distance(lm[4], lm[20])
            index_length = distance(lm[5], lm[8])
            middle_length= distance(lm[9], lm[12])

            ratio      = hand_length / palm_width
            span_ratio = finger_span / palm_width
            score      = (ratio * 0.65) + (span_ratio * 0.35)

            # ── Classification ──
            size_code, size_label = classify_hand(ratio, span_ratio)
            span_type             = classify_span(span_ratio)
            rec                   = recommend_screen(size_code)
            grip                  = get_grip_style(size_code, span_type)
            tier_color            = TIER_COLORS.get(size_code, (255, 255, 255))

            # ── Console Output ──
            hand_label = results.handedness[i][0].display_name if results.handedness else f"Hand {i+1}"
            print(f"\n[{hand_label}]")
            print(f"  Hand Length   : {hand_length:.4f}")
            print(f"  Palm Width    : {palm_width:.4f}")
            print(f"  Finger Span   : {finger_span:.4f}")
            print(f"  Length Ratio  : {ratio:.3f}")
            print(f"  Span Ratio    : {span_ratio:.3f}")
            print(f"  Combined Score: {score:.3f}")
            print(f"  Hand Size     : [{size_code}] {size_label}")
            print(f"  Span Type     : {span_type}")
            print(f"  Screen Size   : {rec['screen']}")
            print(f"  Grip Style    : {grip}")
            print(f"  Phones        : {', '.join(rec['phones'])}")
            print(f"  Note          : {rec['note']}")
            print("─" * 45)

            # ── Draw on Frame ──
            draw_landmarks(img, lm, color=tier_color)
            draw_measurement_line(img, lm[0],  lm[12], "Length", (0, 255, 255))
            draw_measurement_line(img, lm[5],  lm[17], "Palm W", (255, 165,   0))
            draw_measurement_line(img, lm[4],  lm[20], "Span",   (255,   0, 255))

            h_img, w_img, _ = img.shape
            panel_x = 10 if i == 0 else w_img - 310
            panel_y = 10

            draw_info_panel(img, hand_label, {
                "size_code":  size_code,
                "size_label": size_label,
                "span_type":  span_type,
                "ratio":      ratio,
                "span_ratio": span_ratio,
                "score":      score,
                "screen":     rec["screen"],
                "phones":     rec["phones"],
                "grip":       grip,
                "note":       rec["note"],
            }, panel_x, panel_y)

    cv2.imshow("Hand Measurements", img)
    if cv2.waitKey(1) & 0xFF == 27:
        break
cap.release()
cv2.destroyAllWindows()