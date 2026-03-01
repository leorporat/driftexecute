from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ml.infra_inference import force_reload_engine, get_engine
from ml.training.train_infra_index import ARTIFACT_PATH, build_infra_artifacts


app = FastAPI(
    title="InfraPulse ML API",
    version="0.1.0",
    description="Infrastructure Risk + Activity Intelligence API",
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


@app.on_event("startup")
def startup() -> None:
    # Auto-build once for first-run demos.
    if not ARTIFACT_PATH.exists():
        build_infra_artifacts(force=False)
    force_reload_engine()


@app.get("/health")
def health() -> Dict[str, Any]:
    engine = get_engine()
    return {
        "status": "ok",
        "assets": int(len(engine.assets)),
        "reports": int(len(engine.reports)),
    }


@app.get("/map/assets")
def map_assets(type: str = "all") -> Dict[str, Any]:
    try:
        return get_engine().map_assets_geojson(asset_type=type)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"map/assets failed: {exc}") from exc


@app.get("/asset/{asset_id}")
def asset_details(asset_id: str) -> Dict[str, Any]:
    try:
        return get_engine().asset_details(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"asset lookup failed: {exc}") from exc


@app.post("/recommend")
def recommend(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return get_engine().recommend(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"recommend failed: {exc}") from exc


@app.post("/reports/ingest")
def ingest(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return get_engine().ingest_report(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"reports/ingest failed: {exc}") from exc


@app.post("/reports/ingest-batch")
def ingest_batch(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return get_engine().ingest_batch(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"reports/ingest-batch failed: {exc}") from exc


@app.post("/feedback")
def feedback(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return get_engine().submit_feedback(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"feedback failed: {exc}") from exc
