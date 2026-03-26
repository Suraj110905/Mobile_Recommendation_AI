from fastapi import FastAPI
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware
from recommender.phone_recommender import calculate_score, get_screen_range
from pydantic import BaseModel

app = FastAPI()

df = pd.read_excel
("dataset\smartphone_dataset_latest.xlsx")

# Hand Analysis API
@app.post("/analyze-hand")
def analyze_hand(data: dict):

    ratio = data.get("ratio")

    if ratio < 1.5:
        hand_size = "Small"
    elif ratio < 1.8:
        hand_size = "Medium"
    else:
        hand_size = "Large"

    screen_range = get_screen_range(hand_size)

    return {
        "hand_size": hand_size,
        "recommended_screen": screen_range
    }

# Recommendation API
@app.post("/recommend")
def recommend(data: dict):

    user = {
        "budget": data.get("budget"),
        "camera": data.get("camera"),
        "battery": data.get("battery"),
        "gaming": data.get("gaming"),
        "preferred_size": data.get("hand_size")
    }

    screen_range = get_screen_range(user["preferred_size"])

    scores = []

    for index, row in df.iterrows():
        score = calculate_score(row, user, screen_range)
        scores.append(score)

    df["score"] = scores

    top_5 = df.sort_values(by="score", ascending=False).head(5)

    best_phone = top_5.iloc[0]

    return {
        "best_phone": best_phone["phone_model"],
        "top_5": top_5["phone_model"].tolist()
    }
    
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class UserInput(BaseModel):
    budget: int
    camera: int
    battery: int
    gaming: int
    hand_size: str