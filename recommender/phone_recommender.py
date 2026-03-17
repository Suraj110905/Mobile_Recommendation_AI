"""
phone_recommender.py
────────────────────────────────────────────────────────────────────
Standalone phone recommender — works with smartphone_dataset_latest.xlsx
Connect the hand-size output (size_code from hand_measurement.py) to
`user["preferred_size"]` to get a fully integrated recommendation.
────────────────────────────────────────────────────────────────────
"""

import pandas as pd
import os

# ── 1. LOAD DATASET ──────────────────────────────────────────────────────────
# Put the xlsx in the same folder as this script, or change the path below.
DATASET_PATH = r"dataset\smartphone_dataset_latest.xlsx"

df = pd.read_excel(DATASET_PATH)

# ── 2. CLEAN DATASET ─────────────────────────────────────────────────────────
# Segment column has some stray numeric values — replace them with NaN
valid_segments = {"Budget", "Mid-Range", "Mid-Premium", "Premium", "Ultra-Premium"}
df["Segment"] = df["Segment"].apply(lambda x: x if x in valid_segments else None)

# Normalise camera MP to a 1–10 scale (max in dataset = 200 MP)
df["camera_score"] = (df["Main_Cam_MP"] / df["Main_Cam_MP"].max()) * 10

# Normalise battery to 1–10 scale (max = 7550 mAh)
df["battery_score"] = (df["Battery_mAh"] / df["Battery_mAh"].max()) * 10

# Normalise refresh rate as gaming proxy (60→4, 90→6, 120→8, 144→9, 165→10)
refresh_map = {60: 4, 90: 6, 120: 8, 144: 9, 165: 10}
df["gaming_score"] = df["Refresh_Hz"].map(refresh_map).fillna(5)

# ── 3. USER PREFERENCES ──────────────────────────────────────────────────────
# ┌─────────────────────────────────────────────────────────────────────┐
# │  HOW TO CONNECT WITH HAND MEASUREMENT:                              │
# │  Replace preferred_size with the size_code from hand_measurement.py │
# │                                                                     │
# │  Example:                                                           │
# │    size_code, size_label = classify_hand(ratio, span_ratio)         │
# │    user["preferred_size"] = size_code                               │
# └─────────────────────────────────────────────────────────────────────┘
user = {
    "budget":         40000,   # INR — uses Current_Price_INR column
    "camera":         8,       # 1–10: how much you care about camera
    "battery":        8,       # 1–10: how much you care about battery
    "gaming":         7,       # 1–10: how much you care about gaming/refresh
    "preferred_size": "M",     # Hand size code from classifier:
                               #   XS | S | S+ | M- | M | M+ | L | L+ | XL
    "brand":          None,    # e.g. "Samsung", "Apple" — or None to ignore
    "light_phone":    True,    # True = prefer phones under 190g
    "prefer_5g":      True,    # True = prefer 5G phones
}

# ── 4. HAND SIZE → SCREEN RANGE MAPPING ──────────────────────────────────────
# Matches the 9-tier system from hand_measurement.py
SCREEN_RANGES = {
    "XS": (4.7,  5.5),
    "S":  (5.5,  6.0),
    "S+": (5.8,  6.2),
    "M-": (6.1,  6.4),
    "M":  (6.1,  6.5),
    "M+": (6.4,  6.7),
    "L":  (6.5,  6.8),
    "L+": (6.7,  7.0),
    "XL": (7.0,  8.0),
}

# Hand_Size_Fit column values in dataset → which size_codes they match
HAND_FIT_MAP = {
    "XS":        ["XS"],
    "Small":     ["S",  "S+"],
    "Small-Med": ["S+", "M-"],
    "Medium":    ["M-", "M",  "M+"],
    "Large":     ["L",  "L+", "XL"],
}

# ── 5. SCORING FUNCTION ───────────────────────────────────────────────────────
def get_screen_range(size_code):
    return SCREEN_RANGES.get(size_code, (6.1, 6.5))

def calculate_score(phone, user, screen_range):
    score = 0

    # (a) Screen size match — highest weight (30 pts)
    s = phone["Screen_Inch"]
    if screen_range[0] <= s <= screen_range[1]:
        score += 30
    elif abs(s - screen_range[0]) <= 0.3 or abs(s - screen_range[1]) <= 0.3:
        score += 15   # close enough — partial credit
    else:
        score += 5

    # (b) Dataset Hand_Size_Fit column cross-check (10 pts bonus)
    fit_codes = HAND_FIT_MAP.get(phone["Hand_Size_Fit"], [])
    if user["preferred_size"] in fit_codes:
        score += 10

    # (c) Budget match (20 pts)
    price = phone["Current_Price_INR"]
    if price <= user["budget"]:
        score += 20
    elif price <= user["budget"] * 1.10:   # within 10% over budget
        score += 10
    else:
        score -= 10

    # (d) Camera (15 pts max)
    score += (phone["camera_score"] / 10) * 15 * (user["camera"] / 10)

    # (e) Battery (15 pts max)
    score += (phone["battery_score"] / 10) * 15 * (user["battery"] / 10)

    # (f) Gaming / refresh rate (20 pts max)
    score += (phone["gaming_score"] / 10) * 20 * (user["gaming"] / 10)

    # (g) Weight bonus (5 pts)
    if user.get("light_phone") and phone["Weight_g"] < 190:
        score += 5

    # (h) Brand preference (5 pts)
    if user.get("brand") and phone["Brand"] == user["brand"]:
        score += 5

    # (i) 5G preference (5 pts)
    if user.get("prefer_5g") and str(phone["5G"]).strip().lower() == "yes":
        score += 5

    return round(score, 2)

# ── 6. RUN SCORING ────────────────────────────────────────────────────────────
screen_range = get_screen_range(user["preferred_size"])

df["score"] = df.apply(
    lambda row: calculate_score(row, user, screen_range), axis=1
)

# ── 7. RESULTS ────────────────────────────────────────────────────────────────
top_5 = df.sort_values(by="score", ascending=False).head(5).reset_index(drop=True)

display_cols = [
    "Brand", "Model", "Screen_Inch", "Current_Price_INR",
    "Main_Cam_MP", "Battery_mAh", "Refresh_Hz",
    "Weight_g", "Hand_Size_Fit", "5G", "score"
]

print("\n" + "═" * 70)
print("  📱  TOP 5 PHONE RECOMMENDATIONS")
print("═" * 70)
print(f"  Hand Size   : {user['preferred_size']}")
print(f"  Screen Range: {screen_range[0]}\" – {screen_range[1]}\"")
print(f"  Budget      : ₹{user['budget']:,}")
print("═" * 70)

for i, row in top_5.iterrows():
    print(f"\n  #{i+1}  {row['Brand']} {row['Model']}")
    print(f"       Score        : {row['score']}")
    print(f"       Price        : ₹{row['Current_Price_INR']:,}")
    print(f"       Screen       : {row['Screen_Inch']}\"  |  Hand Fit: {row['Hand_Size_Fit']}")
    print(f"       Camera       : {row['Main_Cam_MP']} MP")
    print(f"       Battery      : {row['Battery_mAh']} mAh")
    print(f"       Refresh      : {row['Refresh_Hz']} Hz")
    print(f"       Weight       : {row['Weight_g']} g")
    print(f"       5G           : {row['5G']}")

print("\n" + "═" * 70)
best = top_5.iloc[0]
print(f"  ✅  BEST PICK: {best['Brand']} {best['Model']}  (Score: {best['score']})")
print("═" * 70 + "\n")