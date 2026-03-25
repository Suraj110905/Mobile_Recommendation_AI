from fastapi import FastAPI
import pandas as pd

from recommender.phone_recommender import calculate_score, get_screen_range

app = FastAPI()

df = pd.read_csv("dataset/phones.csv")