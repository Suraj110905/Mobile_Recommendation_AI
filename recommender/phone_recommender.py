# recommender/phone_recommender.py
#
# PURPOSE: Score every phone in the dataset and return top 5 + best pick.
#
# Your dataset columns used here:
#   phone_model       → Brand + Model combined (we create this on load)
#   Screen_Inch       → screen size in inches
#   Hand_Size_Fit     → "Small", "Medium", "Large", "Small-Med", "XS"
#   Current_Price_INR → current price in Indian Rupees
#   camera_score      → computed from Main_Cam_MP (1–10)
#   battery_score     → computed from Battery_mAh (1–10)
#   gaming_score      → computed from Refresh_Hz + RAM_GB (1–10)
#   Weight_g          → phone weight in grams
#   One_Hand_Use      → "Easy", "Moderate", "Hard", "Very Easy"
#   Segment           → "Budget", "Mid-Range", "Mid-Premium", "Premium", "Ultra-Premium"
#   Foldable          → "Yes" or "No"

import pandas as pd
import os


# -------------------------------------------------------
# FUNCTION 1: Map hand size → screen size range (inches)
# -------------------------------------------------------
# This tells us what screen sizes fit a given hand size.
# Based on your dataset's Hand_Size_Fit column values.

def get_screen_range(hand_size: str) -> tuple:
    ranges = {
        "Small":     (4.7, 6.1),
        "Medium":    (6.1, 6.5),
        "Large":     (6.5, 6.9),
    }
    # Default to Medium range if something unexpected comes in
    return ranges.get(hand_size, (6.1, 6.5))


# -------------------------------------------------------
# FUNCTION 2: Load and clean the dataset
# -------------------------------------------------------
# Handles the dirty rows in your file and computes score columns.

def load_dataset() -> pd.DataFrame:

    # Build path to the CSV relative to this file's location
    # This file is at: recommender/phone_recommender.py
    # CSV is at:       dataset/phones_clean.csv
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(base_dir, "dataset", "phones_clean.csv")

    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"Dataset not found at: {csv_path}\n"
            "Make sure phones_clean.csv is inside your dataset/ folder."
        )

    df = pd.read_csv(csv_path)

    # Exclude foldable phones from recommendations
    # (they behave differently from regular phones)
    df = df[df["Foldable"] == "No"].copy()

    # Drop rows with missing critical columns
    df = df.dropna(subset=["Screen_Inch", "Current_Price_INR", "Hand_Size_Fit"])

    return df


# -------------------------------------------------------
# FUNCTION 3: Score a single phone row
# -------------------------------------------------------
# Returns a number. Higher = better match for the user.
#
# Scoring breakdown (total = 100 points):
#   Screen size match   → 25 pts  (does it fit the hand?)
#   Budget match        → 20 pts  (is it within budget?)
#   Camera              → 20 pts  (camera score 1-10)
#   Battery             → 15 pts  (battery score 1-10)
#   Gaming              → 15 pts  (gaming score 1-10)
#   One-hand usability  →  5 pts  (ease of use bonus)

def score_phone(phone: pd.Series, user: dict, screen_range: tuple) -> float:

    score = 0.0

    # --- 1. SCREEN SIZE MATCH (25 points) ---
    # Does this phone's screen fall within the ideal range for the hand?
    screen = phone["Screen_Inch"]
    if screen_range[0] <= screen <= screen_range[1]:
        score += 25                          # perfect fit
    elif abs(screen - screen_range[0]) <= 0.3 or abs(screen - screen_range[1]) <= 0.3:
        score += 15                          # close fit (within 0.3 inch)
    else:
        score += 5                           # poor fit

    # --- 2. BUDGET MATCH (20 points) ---
    # Is the phone within the user's budget?
    price = phone["Current_Price_INR"]
    budget = user["budget"]

    if price <= budget:
        # Reward phones that are good value (not overpriced)
        # Closer to budget ceiling = better use of budget
        ratio = price / budget
        score += 10 + (ratio * 10)           # 10–20 pts
    else:
        # Over budget: penalize proportionally
        over_pct = (price - budget) / budget
        penalty = min(20, over_pct * 30)     # max 20 pt penalty
        score -= penalty

    # --- 3. CAMERA (20 points) ---
    # camera_score is already normalized 1–10 in the dataset
    cam = phone.get("camera_score", 5)
    # Weight by how much the user cares (user["camera"] is 1–10)
    weight = user["camera"] / 10
    score += cam * weight * 2                # max 20 pts

    # --- 4. BATTERY (15 points) ---
    bat = phone.get("battery_score", 5)
    weight = user["battery"] / 10
    score += bat * weight * 1.5              # max 15 pts

    # --- 5. GAMING (15 points) ---
    gam = phone.get("gaming_score", 5)
    weight = user["gaming"] / 10
    score += gam * weight * 1.5              # max 15 pts

    # --- 6. ONE-HAND USABILITY BONUS (5 points) ---
    ease = phone.get("One_Hand_Use", "Moderate")
    ease_bonus = {
        "Very Easy": 5,
        "Easy":      4,
        "Moderate":  2,
        "Hard":      0,
    }
    score += ease_bonus.get(ease, 2)

    return round(score, 2)


# -------------------------------------------------------
# FUNCTION 4: Main recommendation function
# -------------------------------------------------------
# This is what the API calls.
#
# Parameters:
#   hand_size  → "Small", "Medium", or "Large"
#   user_prefs → dict with budget, camera, battery, gaming (all ints)
#
# Returns a dict with best_phone + top_5 list

def get_recommendations(hand_size: str, user_prefs: dict) -> dict:

    df = load_dataset()
    screen_range = get_screen_range(hand_size)

    # Score every phone
    df["score"] = df.apply(
        lambda row: score_phone(row, user_prefs, screen_range),
        axis=1
    )

    # Sort by score, highest first, take top 5
    top5 = df.sort_values("score", ascending=False).head(5)

    # Build the response list — only include useful fields for the frontend
    top5_list = []
    for _, row in top5.iterrows():
        top5_list.append({
            "phone_model":      row["phone_model"],
            "brand":            row["Brand"],
            "model":            row["Model"],
            "screen_inch":      row["Screen_Inch"],
            "price_inr":        int(row["Current_Price_INR"]),
            "weight_g":         row["Weight_g"],
            "camera_mp":        int(row["Main_Cam_MP"]),
            "battery_mah":      int(row["Battery_mAh"]),
            "ram_gb":           int(row["RAM_GB"]),
            "refresh_hz":       int(row["Refresh_Hz"]),
            "one_hand_use":     row["One_Hand_Use"],
            "hand_size_fit":    row["Hand_Size_Fit"],
            "segment":          row["Segment"],
            "has_5g":           row["5G"],
            "score":            row["score"],
        })

    best = top5_list[0] if top5_list else None

    return {
        "hand_size":             hand_size,
        "recommended_screen":    list(screen_range),
        "best_phone":            best["phone_model"] if best else "No match found",
        "best_phone_details":    best,
        "top_5":                 top5_list,
    }


# -------------------------------------------------------
# Quick test — run this file directly to verify it works
# Usage: python recommender/phone_recommender.py
# -------------------------------------------------------
if __name__ == "__main__":
    result = get_recommendations(
        hand_size="Medium",
        user_prefs={"budget": 40000, "camera": 8, "battery": 9, "gaming": 7}
    )
    print(f"Best phone: {result['best_phone']}")
    print(f"Recommended screen: {result['recommended_screen']} inches")
    print("\nTop 5:")
    for i, p in enumerate(result["top_5"], 1):
        print(f"  {i}. {p['phone_model']} — ₹{p['price_inr']:,} — Score: {p['score']}")