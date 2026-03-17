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

def classify_hand(ratio):
    if ratio < 1.5:
        return "Small"
    elif ratio < 1.8:
        return "Medium"
    else:
        return "Large"

def classify_span(span_ratio):
    """Extra category based on finger spread."""
    if span_ratio < 1.2:
        return "Narrow"
    elif span_ratio < 1.6:
        return "Average"
    else:
        return "Wide"

def recommend_screen(hand_size):
    screens = {
        "Small":  ("5.5 - 6.1 inches", ["iPhone 15",       "Samsung Galaxy S23",    "Pixel 7"]),
        "Medium": ("6.1 - 6.5 inches", ["iPhone 15 Plus",  "Samsung Galaxy S23+",   "Pixel 7 Pro"]),
        "Large":  ("6.5 - 6.9 inches", ["iPhone 15 Pro Max","Samsung Galaxy S23 Ultra","Pixel Fold"]),
    }
    return screens.get(hand_size, ("Unknown", []))

def get_grip_style(hand_size, span_type):
    """Suggest grip style based on hand size + span."""
    if hand_size == "Small" and span_type == "Narrow":
        return "One-Hand Grip"
    elif hand_size == "Large" and span_type == "Wide":
        return "Two-Hand Power Grip"
    elif hand_size == "Medium":
        return "Hybrid Grip"
    else:
        return "Adaptive Grip"

# ── Drawing Helpers ───────────────────────────────────────────────────────────

def draw_landmarks(img, hand_landmarks):
    h, w, _ = img.shape
    for start_idx, end_idx in HAND_CONNECTIONS:
        x0 = int(hand_landmarks[start_idx].x * w)
        y0 = int(hand_landmarks[start_idx].y * h)
        x1 = int(hand_landmarks[end_idx].x * w)
        y1 = int(hand_landmarks[end_idx].y * h)
        cv2.line(img, (x0, y0), (x1, y1), (0, 255, 0), 2)
    for lm in hand_landmarks:
        cx, cy = int(lm.x * w), int(lm.y * h)
        cv2.circle(img, (cx, cy), 5, (255, 0, 0), -1)

def draw_measurement_line(img, p1, p2, label, color=(0, 255, 255)):
    h, w, _ = img.shape
    x1, y1 = int(p1.x * w), int(p1.y * h)
    x2, y2 = int(p2.x * w), int(p2.y * h)
    cv2.line(img, (x1, y1), (x2, y2), color, 2)
    mid_x, mid_y = (x1 + x2) // 2, (y1 + y2) // 2
    cv2.putText(img, label, (mid_x + 5, mid_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

def draw_info_panel(img, hand_label, data, panel_x, panel_y):
    """Draw a rounded info panel for each detected hand."""
    panel_w, panel_h = 280, 230
    overlay = img.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, img, 0.35, 0, img)
    cv2.rectangle(img, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), (80, 80, 80), 1)

    # Color coding per hand size
    size_colors = {"Small": (0, 200, 255), "Medium": (0, 255, 150), "Large": (0, 100, 255)}
    size_color = size_colors.get(data["hand_size"], (255, 255, 255))

    lines = [
        (f"  {hand_label}",                          (255, 255, 255), 0.60, 2),
        (f"  Size   : {data['hand_size']}",           size_color,      0.55, 1),
        (f"  Span   : {data['span_type']}",           (200, 200, 255), 0.50, 1),
        (f"  Ratio  : {data['ratio']:.2f}",           (180, 180, 180), 0.50, 1),
        (f"  SpanR  : {data['span_ratio']:.2f}",      (180, 180, 180), 0.50, 1),
        (f"  Screen : {data['screen_size']}",         (0, 255, 255),   0.50, 1),
        (f"  Grip   : {data['grip']}",                (255, 200, 100), 0.50, 1),
        (f"  e.g. {data['phones'][0]}",               (150, 150, 150), 0.45, 1),
        (f"       {data['phones'][1]}",               (150, 150, 150), 0.45, 1),
    ]

    for idx, (text, color, scale, thickness) in enumerate(lines):
        y = panel_y + 25 + idx * 24
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
            hand_length = distance(lm[0], lm[12])
            palm_width  = distance(lm[5], lm[17])
            finger_span = distance(lm[4], lm[20])

            ratio      = hand_length / palm_width
            span_ratio = finger_span / palm_width

            # ── Classification ──
            hand_size  = classify_hand(ratio)
            span_type  = classify_span(span_ratio)
            screen_size, phones = recommend_screen(hand_size)
            grip       = get_grip_style(hand_size, span_type)

            # ── Console Output ──
            hand_label = results.handedness[i][0].display_name if results.handedness else f"Hand {i+1}"
            print(f"\n[{hand_label}]")
            print(f"  Hand Length  : {hand_length:.4f}")
            print(f"  Palm Width   : {palm_width:.4f}")
            print(f"  Finger Span  : {finger_span:.4f}")
            print(f"  Ratio        : {ratio:.2f}  → {hand_size}")
            print(f"  Span Ratio   : {span_ratio:.2f}  → {span_type}")
            print(f"  Screen Size  : {screen_size}")
            print(f"  Grip Style   : {grip}")
            print(f"  Phones       : {', '.join(phones)}")
            print("─" * 40)

            # ── Draw on Frame ──
            draw_landmarks(img, lm)
            draw_measurement_line(img, lm[0],  lm[12], "Length", (0, 255, 255))
            draw_measurement_line(img, lm[5],  lm[17], "Palm W", (255, 165, 0))
            draw_measurement_line(img, lm[4],  lm[20], "Span",   (255, 0, 255))

            # Panel position: left for first hand, right for second
            h_img, w_img, _ = img.shape
            panel_x = 10 if i == 0 else w_img - 295
            panel_y = 10

            draw_info_panel(img, hand_label, {
                "hand_size":  hand_size,
                "span_type":  span_type,
                "ratio":      ratio,
                "span_ratio": span_ratio,
                "screen_size":screen_size,
                "phones":     phones,
                "grip":       grip,
            }, panel_x, panel_y)

    cv2.imshow("Hand Measurements", img)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()