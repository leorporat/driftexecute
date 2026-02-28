from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ml.inference import recommend


app = FastAPI(
    title="Travel Recommender API",
    version="0.1.0",
    description="Offline-trained similarity recommender served via FastAPI.",
)

allowed_origins = os.getenv(
    "ML_API_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/recommend")
def recommend_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        result = recommend(payload=payload, top_n=5, neighbor_k=20)
        return {
            "recommended_destinations": result["recommended_destinations"],
            "neighbors": result["neighbors"],
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Recommendation failed: {exc}") from exc
