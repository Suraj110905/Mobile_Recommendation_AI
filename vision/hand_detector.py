# hand_detector.py
# PURPOSE: Opens your webcam and draws hand landmarks in real time.
# This is just for TESTING that MediaPipe works on your machine.
# Run this file directly: python vision/hand_detector.py

import cv2
import mediapipe as mp
import numpy as np
import os

# -------------------------------------------------------
# NEW MEDIAPIPE IMPORTS
# -------------------------------------------------------
# These are the new-style imports (mp.tasks.vision)
# instead of the old mp.solutions.hands
BaseOptions        = mp.tasks.BaseOptions
HandLandmarker     = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode  = mp.tasks.vision.RunningMode

# -------------------------------------------------------
# PATH TO MODEL FILE
# -------------------------------------------------------
# os.path.dirname(__file__)  → folder where this script lives  (vision/)
# ..                         → go one level up               (project root)
# models/hand_landmarker.task → the model file you downloaded

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "hand_landmarker.task"
)

# -------------------------------------------------------
# CREATE THE DETECTOR
# -------------------------------------------------------
# LIVE_STREAM mode = processes frames from webcam continuously
# num_hands = 1 means we only detect one hand at a time

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,  # IMAGE mode for frame-by-frame
    num_hands=1
)

# -------------------------------------------------------
# DRAW LANDMARKS HELPER
# -------------------------------------------------------
# This function takes a frame and detection result,
# and draws dots + lines on the hand

def draw_landmarks(frame, detection_result):
    # detection_result.hand_landmarks is a list of hands
    # each hand is a list of 21 landmark points
    for hand_landmarks in detection_result.hand_landmarks:
        # Each landmark has .x, .y (0.0 to 1.0 — normalized)
        # Multiply by image width/height to get pixel positions
        h, w = frame.shape[:2]
        
        points = []
        for lm in hand_landmarks:
            px = int(lm.x * w)
            py = int(lm.y * h)
            points.append((px, py))
            cv2.circle(frame, (px, py), 5, (0, 255, 0), -1)  # green dot
        
        # Draw connections between landmarks (the skeleton lines)
        # These are the official MediaPipe hand connections
        connections = [
            (0,1),(1,2),(2,3),(3,4),       # thumb
            (0,5),(5,6),(6,7),(7,8),       # index finger
            (0,9),(9,10),(10,11),(11,12),  # middle finger
            (0,13),(13,14),(14,15),(15,16),# ring finger
            (0,17),(17,18),(18,19),(19,20),# pinky
            (5,9),(9,13),(13,17)           # palm connections
        ]
        for start, end in connections:
            cv2.line(frame, points[start], points[end], (255, 255, 255), 1)
    
    return frame


# -------------------------------------------------------
# MAIN LOOP - Open webcam and run detection
# -------------------------------------------------------
with HandLandmarker.create_from_options(options) as detector:
    
    cap = cv2.VideoCapture(0)  # 0 = default webcam
    
    print("Webcam opened. Show your hand. Press ESC to quit.")
    
    while True:
        success, frame = cap.read()
        if not success:
            print("Could not read from webcam.")
            break
        
        # Convert frame: OpenCV uses BGR, MediaPipe needs RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Wrap in MediaPipe Image object
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        # Run detection
        result = detector.detect(mp_image)
        
        # Draw landmarks if a hand was found
        if result.hand_landmarks:
            frame = draw_landmarks(frame, result)
            cv2.putText(frame, "Hand detected!", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        else:
            cv2.putText(frame, "No hand detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        cv2.imshow("Hand Detection", frame)
        
        if cv2.waitKey(1) & 0xFF == 27:  # 27 = ESC key
            break
    
    cap.release()
    cv2.destroyAllWindows()