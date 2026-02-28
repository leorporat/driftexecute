from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

import joblib
import numpy as np
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT_PATH = REPO_ROOT / "ml" / "models" / "trip_recommender.joblib"


def normalize_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(text).lower()).strip()


def month_to_season(month_value: Any) -> str:
    try:
        month = int(float(month_value))
    except (TypeError, ValueError):
        return "Unknown"

    if month in {12, 1, 2}:
        return "Winter"
    if month in {3, 4, 5}:
        return "Spring"
    if month in {6, 7, 8}:
        return "Summer"
    if month in {9, 10, 11}:
        return "Fall"
    return "Unknown"


def parse_month_from_date(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    parsed = pd.to_datetime(pd.Series([raw]), errors="coerce").dt.month.iloc[0]
    if pd.isna(parsed):
        return None
    return float(parsed)


def coerce_numeric(raw: Any) -> float:
    if raw is None:
        return np.nan
    if isinstance(raw, (int, float, np.integer, np.floating)):
        return float(raw)

    text = str(raw).strip()
    if text == "":
        return np.nan

    cleaned = re.sub(r"[^\d\.\-]", "", text)
    if cleaned == "":
        return np.nan
    try:
        return float(cleaned)
    except ValueError:
        return np.nan


def clean_record(record: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in record.items():
        if pd.isna(value):
            cleaned[key] = None
        elif isinstance(value, (np.floating, float)):
            cleaned[key] = float(value)
        elif isinstance(value, (np.integer, int)):
            cleaned[key] = int(value)
        else:
            cleaned[key] = value
    return cleaned


class TripRecommender:
    def __init__(self, artifact_path: Optional[Path] = None) -> None:
        self.artifact_path = artifact_path or DEFAULT_ARTIFACT_PATH
        self.artifact = self._load_artifact()
        self.pipeline = self.artifact["pipeline"]
        self.X: pd.DataFrame = self.artifact["X"]
        self.y: pd.Series = self.artifact["y"]
        self.feature_columns: list[str] = self.artifact["feature_columns"]
        self.numeric_features: list[str] = self.artifact.get("numeric_features", [])
        self.categorical_features: list[str] = self.artifact.get("categorical_features", [])
        self.neighbor_rows: pd.DataFrame = self.artifact.get("neighbor_rows", self.X.copy())
        self.destination_column: str = self.artifact.get("destination_column", "Destination")

    def _load_artifact(self) -> Dict[str, Any]:
        if not self.artifact_path.exists():
            raise FileNotFoundError(
                f"Model artifact not found at {self.artifact_path}. "
                "Run training first: python ml/training/train_recommender.py"
            )
        artifact = joblib.load(self.artifact_path)
        required = {"pipeline", "X", "y", "feature_columns"}
        missing = required - set(artifact.keys())
        if missing:
            raise ValueError(f"Invalid artifact missing keys: {sorted(missing)}")
        return artifact

    def _prepare_query_frame(self, payload: Dict[str, Any]) -> pd.DataFrame:
        normalized_payload = {normalize_name(k): v for k, v in payload.items()}
        prepared: Dict[str, Any] = {}

        # Compute helpers once for derived features.
        raw_start_month = normalized_payload.get(normalize_name("start_month"))
        raw_start_date = normalized_payload.get(normalize_name("Start date"))

        parsed_start_month: Optional[float] = None
        if raw_start_month is not None and str(raw_start_month).strip() != "":
            try:
                parsed_start_month = float(raw_start_month)
            except (TypeError, ValueError):
                parsed_start_month = None
        if parsed_start_month is None and raw_start_date is not None:
            parsed_start_month = parse_month_from_date(raw_start_date)

        for feature in self.feature_columns:
            value = normalized_payload.get(normalize_name(feature))

            if feature == "start_month" and value is None:
                value = parsed_start_month
            if feature == "season" and value is None:
                value = month_to_season(parsed_start_month)

            if feature in self.numeric_features:
                prepared[feature] = coerce_numeric(value)
            elif feature in self.categorical_features:
                prepared[feature] = "Unknown" if value is None or str(value).strip() == "" else str(value)
            else:
                prepared[feature] = value

        return pd.DataFrame([prepared], columns=self.feature_columns)

    def recommend(
        self,
        payload: Dict[str, Any],
        top_n: int = 5,
        neighbor_k: int = 20,
    ) -> Dict[str, Any]:
        if len(self.X) == 0:
            return {"recommended_destinations": [], "neighbors": []}

        query_df = self._prepare_query_frame(payload)

        matrix = self.pipeline.named_steps["preprocess"].transform(query_df)
        k = max(1, min(int(neighbor_k), len(self.X)))
        distances, indices = self.pipeline.named_steps["nn"].kneighbors(matrix, n_neighbors=k)

        neighbor_indices = indices[0]
        neighbor_distances = distances[0]
        neighbor_destinations = self.y.iloc[neighbor_indices].astype(str)

        destination_rank = neighbor_destinations.value_counts().head(max(1, int(top_n)))
        recommended_destinations = destination_rank.index.tolist()

        example_rows = self.neighbor_rows.iloc[neighbor_indices].copy()
        if self.destination_column not in example_rows.columns:
            example_rows[self.destination_column] = neighbor_destinations.values
        example_rows["similarity"] = [float(1.0 - d) for d in neighbor_distances]

        neighbors = [clean_record(rec) for rec in example_rows.to_dict(orient="records")]
        return {
            "recommended_destinations": recommended_destinations,
            "neighbors": neighbors,
        }


@lru_cache(maxsize=2)
def get_recommender(artifact_path: Optional[str] = None) -> TripRecommender:
    path = Path(artifact_path) if artifact_path else DEFAULT_ARTIFACT_PATH
    return TripRecommender(path)


def recommend(
    payload: Dict[str, Any],
    top_n: int = 5,
    neighbor_k: int = 20,
    artifact_path: Optional[str] = None,
) -> Dict[str, Any]:
    model = get_recommender(artifact_path)
    return model.recommend(payload=payload, top_n=top_n, neighbor_k=neighbor_k)

