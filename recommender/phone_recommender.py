# This file has two jobs:
# 1. Given a hand size, return what screen size range fits best
# 2. Given user requirements + hand size, score all phones and return top 5

import pandas as pd
import os

# ---------------------------------------------------------
# FUNCTION 1: Map hand size to screen size range
# ---------------------------------------------------------
# Input: "Small", "Medium", or "Large"
# Output: a tuple like (6.1, 6.5) meaning min and max inches

def get_screen_range(hand_size):
    if hand_size == "Small":
        return (5.5, 6.1)
    elif hand_size == "Medium":
        return (6.1, 6.5)
    else:  # Large
        return (6.5, 6.9)


# ---------------------------------------------------------
# FUNCTION 2: Score a single phone
# ---------------------------------------------------------
# We give each phone a score out of 100 based on how well
# it matches what the user wants.
# 
# phone     = one row from the CSV (one phone's data)
# user      = dictionary with budget, camera, battery, gaming
# screen_range = tuple like (6.1, 6.5)

def calculate_score(phone, user, screen_range):
    score = 0

    # SCREEN SIZE MATCH (30 points)
    # Does this phone's screen fit the hand size?
    if screen_range[0] <= phone["screen_size"] <= screen_range[1]:
        score += 30
    else:
        score += 5  # small penalty if screen doesn't match

    # BUDGET MATCH (20 points)
    # Is the phone within budget?
    if phone["price"] <= user["budget"]:
        score += 20
    else:
        # Penalize more the more over budget it is
        over_by = phone["price"] - user["budget"]
        penalty = min(20, over_by / 1000)
        score -= penalty

    # CAMERA (15 points)
    # user["camera"] is 1-10. Phone camera_score is also 1-10.
    score += (phone["camera_score"] / 10) * 15

    # BATTERY (15 points)
    score += (phone["battery_score"] / 10) * 15

    # GAMING (20 points)
    score += (phone["gaming_score"] / 10) * 20

    return round(score, 2)


# ---------------------------------------------------------
# FUNCTION 3: Get top 5 recommendations
# ---------------------------------------------------------
# This is the main function the API will call.
# 
# hand_size = "Small", "Medium", or "Large"
# user_prefs = dict with budget, camera, battery, gaming values
# 
# Returns a dict with:
#   - best_phone: name of the #1 phone
#   - top_5: list of 5 phone names

def get_recommendations(hand_size, user_prefs):
    
    # Build the path to phones.csv regardless of where we run from
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(base_dir, "dataset", "phones.csv")
    
    # Load the dataset
    df = pd.read_csv(csv_path)

    # Get the screen range for this hand size
    screen_range = get_screen_range(hand_size)

    # Score every phone in the dataset
    scores = []
    for _, row in df.iterrows():
        s = calculate_score(row, user_prefs, screen_range)
        scores.append(s)

    df["score"] = scores

    # Sort by score (highest first) and take top 5
    top_5_df = df.sort_values(by="score", ascending=False).head(5)

    # Build the result
    best_phone = top_5_df.iloc[0]["phone_model"]
    
    top_5_list = []
    for _, row in top_5_df.iterrows():
        top_5_list.append({
            "phone_model": row["phone_model"],
            "screen_size": row["screen_size"],
            "price": row["price"],
            "score": row["score"]
        })

    return {
        "best_phone": best_phone,
        "top_5": top_5_list,
        "hand_size": hand_size,
        "recommended_screen": list(screen_range)
    }