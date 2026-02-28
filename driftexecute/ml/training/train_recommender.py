from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = REPO_ROOT / "ml" / "data" / "travel_details_dataset.csv"
DEFAULT_MODEL_PATH = REPO_ROOT / "ml" / "models" / "trip_recommender.joblib"


FEATURE_SPECS: Dict[str, Dict[str, Any]] = {
    "Duration (days)": {
        "kind": "numeric",
        "aliases": ["Duration (days)", "Duration", "Trip duration", "Days"],
    },
    "Traveler age": {
        "kind": "numeric",
        "aliases": ["Traveler age", "Age", "Traveller age", "Traveler_age"],
    },
    "Traveler gender": {
        "kind": "categorical",
        "aliases": ["Traveler gender", "Gender", "Traveller gender", "Sex"],
    },
    "Traveler nationality": {
        "kind": "categorical",
        "aliases": [
            "Traveler nationality",
            "Nationality",
            "Traveller nationality",
            "Country",
        ],
    },
    "Accommodation type": {
        "kind": "categorical",
        "aliases": ["Accommodation type", "Accommodation", "Stay type"],
    },
    "Accommodation cost": {
        "kind": "numeric_currency",
        "aliases": ["Accommodation cost", "Hotel cost", "Lodging cost"],
    },
    "Transportation type": {
        "kind": "categorical",
        "aliases": ["Transportation type", "Transport type", "Transportation"],
    },
    "Transportation cost": {
        "kind": "numeric_currency",
        "aliases": ["Transportation cost", "Transport cost", "Travel cost"],
    },
    "start_month": {
        "kind": "numeric_month",
        "aliases": ["start_month", "Start month", "Month"],
    },
    "season": {
        "kind": "categorical_season",
        "aliases": ["season", "Season"],
    },
}

DESTINATION_ALIASES = ["Destination", "Travel destination", "City", "Place"]
START_DATE_ALIASES = ["Start date", "Start Date", "Trip start date", "Date"]
PII_COLUMNS = ["Trip ID", "Traveler name"]


def normalize_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower()).strip()


def find_existing_column(df: pd.DataFrame, aliases: Iterable[str]) -> Optional[str]:
    normalized_map = {normalize_name(col): col for col in df.columns}
    for alias in aliases:
        hit = normalized_map.get(normalize_name(alias))
        if hit is not None:
            return hit
    return None


def parse_currency_series(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace(r"[^\d\.\-]", "", regex=True)
        .str.strip()
    )
    cleaned = cleaned.replace({"": np.nan, "nan": np.nan, "None": np.nan})
    return pd.to_numeric(cleaned, errors="coerce")


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


def detect_dataset_path(explicit_path: Optional[Path]) -> Path:
    if explicit_path is not None:
        return explicit_path

    if DEFAULT_DATA_PATH.exists():
        return DEFAULT_DATA_PATH

    fallback = REPO_ROOT.parent / "ml" / "data" / "travel_details_dataset.csv"
    if fallback.exists():
        return fallback

    raise FileNotFoundError(
        "Dataset not found. Place it at ml/data/travel_details_dataset.csv "
        "relative to the repo root."
    )


def build_training_frames(df: pd.DataFrame) -> Dict[str, Any]:
    df = df.copy()
    for pii in PII_COLUMNS:
        if pii in df.columns:
            df = df.drop(columns=[pii])

    destination_col = find_existing_column(df, DESTINATION_ALIASES)
    if destination_col is None:
        raise ValueError(
            "Could not find destination column. Expected one of: "
            + ", ".join(DESTINATION_ALIASES)
        )

    start_date_col = find_existing_column(df, START_DATE_ALIASES)
    explicit_month_col = find_existing_column(df, FEATURE_SPECS["start_month"]["aliases"])

    parsed_start_month = None
    if explicit_month_col is not None:
        parsed_start_month = pd.to_numeric(df[explicit_month_col], errors="coerce")
    elif start_date_col is not None:
        parsed_start_month = pd.to_datetime(df[start_date_col], errors="coerce").dt.month

    X = pd.DataFrame(index=df.index)
    numeric_features: list[str] = []
    categorical_features: list[str] = []
    resolved_columns: dict[str, Optional[str]] = {}

    for feature_name, spec in FEATURE_SPECS.items():
        kind = spec["kind"]
        source_col = find_existing_column(df, spec["aliases"])
        resolved_columns[feature_name] = source_col

        if feature_name == "start_month":
            if parsed_start_month is not None:
                X[feature_name] = pd.to_numeric(parsed_start_month, errors="coerce")
                numeric_features.append(feature_name)
            continue

        if feature_name == "season":
            if parsed_start_month is not None:
                X[feature_name] = parsed_start_month.map(month_to_season)
                categorical_features.append(feature_name)
            elif source_col is not None:
                X[feature_name] = df[source_col].astype(str).replace({"nan": "Unknown"})
                categorical_features.append(feature_name)
            continue

        if source_col is None:
            continue

        if kind == "numeric":
            X[feature_name] = pd.to_numeric(df[source_col], errors="coerce")
            numeric_features.append(feature_name)
        elif kind == "numeric_currency":
            X[feature_name] = parse_currency_series(df[source_col])
            numeric_features.append(feature_name)
        elif kind == "categorical":
            X[feature_name] = df[source_col].astype(str).replace({"nan": "Unknown"})
            categorical_features.append(feature_name)

    if X.shape[1] == 0:
        raise ValueError(
            "No usable feature columns were found. Check dataset columns against expected schema."
        )

    y = df[destination_col].astype(str).replace({"nan": "Unknown"})
    y = y.fillna("Unknown")

    # Keep original rows for UI examples + add engineered fields for display.
    neighbor_rows = df.copy()
    if parsed_start_month is not None and "start_month" not in neighbor_rows.columns:
        neighbor_rows["start_month"] = pd.to_numeric(parsed_start_month, errors="coerce")
    if "season" not in neighbor_rows.columns and parsed_start_month is not None:
        neighbor_rows["season"] = parsed_start_month.map(month_to_season)

    return {
        "X": X,
        "y": y,
        "destination_column": destination_col,
        "neighbor_rows": neighbor_rows,
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "resolved_columns": resolved_columns,
    }


def train_and_save(
    dataset_path: Path,
    model_path: Path,
    n_neighbors: int,
) -> None:
    df = pd.read_csv(dataset_path)
    frames = build_training_frames(df)

    X: pd.DataFrame = frames["X"]
    y: pd.Series = frames["y"]
    numeric_features: list[str] = frames["numeric_features"]
    categorical_features: list[str] = frames["categorical_features"]

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocess = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_features),
            ("cat", categorical_pipeline, categorical_features),
        ],
        remainder="drop",
    )

    effective_neighbors = max(1, min(n_neighbors, len(X)))
    nearest = NearestNeighbors(metric="cosine", algorithm="brute", n_neighbors=effective_neighbors)
    pipeline = Pipeline(
        steps=[
            ("preprocess", preprocess),
            ("nn", nearest),
        ]
    )
    pipeline.fit(X)

    artifact = {
        "pipeline": pipeline,
        "X": X.reset_index(drop=True),
        "y": y.reset_index(drop=True),
        "feature_columns": list(X.columns),
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "destination_column": frames["destination_column"],
        "neighbor_rows": frames["neighbor_rows"].reset_index(drop=True),
        "resolved_columns": frames["resolved_columns"],
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)

    print(f"[ok] trained with {len(X)} rows and {X.shape[1]} feature columns")
    print(f"[ok] numeric features: {numeric_features}")
    print(f"[ok] categorical features: {categorical_features}")
    print(f"[ok] saved artifact: {model_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train similarity-based trip recommender.")
    parser.add_argument(
        "--data-path",
        type=Path,
        default=None,
        help="Optional path to CSV dataset.",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help="Path to save the joblib model artifact.",
    )
    parser.add_argument(
        "--neighbors",
        type=int,
        default=50,
        help="Max neighbors to keep in NN model.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_path = detect_dataset_path(args.data_path)
    train_and_save(
        dataset_path=dataset_path,
        model_path=args.model_path,
        n_neighbors=args.neighbors,
    )


if __name__ == "__main__":
    main()

