import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import os
import urllib.request

# Download the hand landmarker model if not present
MODEL_PATH = "hand_landmarker.task"
if not os.path.exists(MODEL_PATH):
    print("Downloading hand landmarker model...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        MODEL_PATH
    )
    print("Model downloaded.")

# Hand connections
HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (5,6),(6,7),(7,8),
    (9,10),(10,11),(11,12),
    (13,14),(14,15),(15,16),
    (17,18),(18,19),(19,20),
    (0,5),(5,9),(9,13),(13,17),(0,17)
]

def draw_landmarks_on_image(img, detection_result):
    if not detection_result.hand_landmarks:
        return img

    h, w, _ = img.shape

    for hand_landmarks in detection_result.hand_landmarks:
        # Draw connections
        for start_idx, end_idx in HAND_CONNECTIONS:
            x0 = int(hand_landmarks[start_idx].x * w)
            y0 = int(hand_landmarks[start_idx].y * h)
            x1 = int(hand_landmarks[end_idx].x * w)
            y1 = int(hand_landmarks[end_idx].y * h)
            cv2.line(img, (x0, y0), (x1, y1), (0, 255, 0), 2)

        # Draw landmark points
        for lm in hand_landmarks:
            cx, cy = int(lm.x * w), int(lm.y * h)
            cv2.circle(img, (cx, cy), 5, (255, 0, 0), -1)

    return img

# Setup Hand Landmarker
base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=2
)
detector = vision.HandLandmarker.create_from_options(options)

cap = cv2.VideoCapture(0)
print("Press ESC to quit.")

while True:
    success, img = cap.read()
    if not success:
        print("Failed to grab frame.")
        break

    # Convert to RGB for MediaPipe
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

    # Detect hands
    results = detector.detect(mp_image)

    # Draw landmarks
    img = draw_landmarks_on_image(img, results)

    cv2.imshow("Hand Detection", img)

    if cv2.waitKey(1) & 0xFF == 27:  # ESC to quit
        break

cap.release()
cv2.destroyAllWindows()