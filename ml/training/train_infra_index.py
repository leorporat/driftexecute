from __future__ import annotations

import argparse
import math
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler


REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
DATASETS_DIR = ML_ROOT / "datasets"
ARTIFACTS_DIR = ML_ROOT / "artifacts"
FEEDBACK_DIR = ML_ROOT / "feedback"

BRIDGES_PATH = DATASETS_DIR / "bridges.csv"
ROADS_PATH = DATASETS_DIR / "roads.csv"
REPORTS_PATH = DATASETS_DIR / "reports.csv"
ARTIFACT_PATH = ARTIFACTS_DIR / "infra_index.joblib"

CITY_BOUNDS = {
    "lat_min": 41.64,
    "lat_max": 42.05,
    "lon_min": -87.95,
    "lon_max": -87.52,
}

STRUCTURED_COLS = [
    "age_years",
    "traffic_metric",
    "condition_norm",
    "report_30d",
    "report_180d",
    "activity_ratio",
]

INCIDENT_ARCHETYPES = [
    ("pothole", "Repeated pothole rebound after winter freeze-thaw and heavy truck traffic."),
    ("crack", "Longitudinal cracking near wheel path with water ingress and patch separation."),
    ("spalling", "Concrete spalling and exposed rebar found around deck edge and joint line."),
    ("corrosion", "Corrosion staining and section loss observed on bearing and steel members."),
    ("drainage", "Standing water, blocked inlets, and shoulder washout after rainfall events."),
    ("sinkhole", "Localized pavement settlement and subgrade void risk near utility crossing."),
    ("joint_failure", "Expansion joint leakage accelerating deck and support deterioration."),
    ("fatigue", "Fatigue cracking at welded detail under repeated heavy axle loading."),
    ("scour", "Pier scour concerns from high-flow channel migration and undermining signs."),
    ("delamination", "Deck delamination with hollow sound and moisture intrusion evidence."),
]

ROAD_SURFACES = ["asphalt", "concrete", "composite"]
BRIDGE_MATERIALS = ["steel", "reinforced_concrete", "prestressed_concrete", "composite"]


@dataclass(frozen=True)
class DatasetConfig:
    bridges: int = 360
    roads: int = 1000
    reports: int = 4000
    seed: int = 42


def ensure_dirs() -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


def random_lat_lon(rng: random.Random) -> tuple[float, float]:
    lat = rng.uniform(CITY_BOUNDS["lat_min"], CITY_BOUNDS["lat_max"])
    lon = rng.uniform(CITY_BOUNDS["lon_min"], CITY_BOUNDS["lon_max"])
    return round(lat, 6), round(lon, 6)


def maybe_image_url(asset_id: str, rng: random.Random) -> str:
    if rng.random() < 0.62:
        return ""
    tag = rng.choice(
        [
            "pothole",
            "crack",
            "spalling",
            "corrosion",
            "drainage",
            "joint",
            "washout",
            "fatigue",
        ]
    )
    return f"https://example.com/images/{asset_id.lower()}_{tag}.jpg"


def choose_archetype(asset_type: str, rng: random.Random) -> tuple[str, str]:
    if asset_type == "bridge":
        pool = [a for a in INCIDENT_ARCHETYPES if a[0] not in {"pothole", "sinkhole"}]
    else:
        pool = [a for a in INCIDENT_ARCHETYPES if a[0] not in {"fatigue", "scour"}]
    return rng.choice(pool)


def build_bridge_note(archetype: tuple[str, str], rng: random.Random) -> str:
    weather = rng.choice(["after heavy rain", "during freeze-thaw cycle", "during peak load period"])
    return (
        f"{archetype[1]} Field crew noted recurring pattern {weather}. "
        f"Follow-up inspection recommended within {rng.choice([14, 30, 45])} days."
    )


def build_road_note(archetype: tuple[str, str], rng: random.Random) -> str:
    surface = rng.choice(["travel lane", "shoulder edge", "wheel path", "drain inlet area"])
    return (
        f"{archetype[1]} Distress concentrated near {surface}. "
        f"Temporary patch applied {rng.choice(['last month', 'two weeks ago', 'this week'])}."
    )


def random_recent_date(days_back: int, rng: random.Random) -> datetime:
    now = datetime.now(timezone.utc)
    return now - timedelta(days=rng.randint(0, days_back), hours=rng.randint(0, 23))


def generate_bridges(config: DatasetConfig) -> pd.DataFrame:
    rng = random.Random(config.seed)
    rows: list[dict[str, object]] = []
    for idx in range(config.bridges):
        asset_id = f"BRG-{idx + 1:04d}"
        lat, lon = random_lat_lon(rng)
        year_built = rng.randint(1950, 2018)
        traffic = rng.randint(3000, 135000)
        deck = max(0, min(9, int(round(rng.gauss(5.3, 1.7)))))
        superstructure = max(0, min(9, int(round(rng.gauss(5.2, 1.8)))))
        substructure = max(0, min(9, int(round(rng.gauss(5.6, 1.6)))))
        inspection_dt = random_recent_date(380, rng).date().isoformat()
        archetype = choose_archetype("bridge", rng)
        note = build_bridge_note(archetype, rng)
        repair_history = (
            ""
            if rng.random() < 0.28
            else "; ".join(
                [
                    f"{rng.choice(['joint seal', 'deck patch', 'bearing maintenance', 'drain clearing'])} "
                    f"{random_recent_date(1400, rng).date().isoformat()}"
                    for _ in range(rng.randint(1, 3))
                ]
            )
        )
        images = "|".join([u for u in [maybe_image_url(asset_id, rng), maybe_image_url(asset_id, rng)] if u])
        rows.append(
            {
                "asset_id": asset_id,
                "asset_type": "bridge",
                "name": f"{rng.choice(['North', 'South', 'East', 'West', 'Central'])} Span {idx + 1}",
                "lat": lat,
                "lon": lon,
                "year_built": year_built,
                "material": rng.choice(BRIDGE_MATERIALS),
                "avg_daily_traffic": traffic,
                "deck_rating": deck,
                "superstructure_rating": superstructure,
                "substructure_rating": substructure,
                "last_inspection_date": inspection_dt,
                "inspection_notes": note,
                "repair_history": repair_history,
                "images": images,
            }
        )
    return pd.DataFrame(rows)


def generate_roads(config: DatasetConfig) -> pd.DataFrame:
    rng = random.Random(config.seed + 7)
    rows: list[dict[str, object]] = []
    for idx in range(config.roads):
        asset_id = f"RD-{idx + 1:05d}"
        lat, lon = random_lat_lon(rng)
        traffic = rng.randint(800, 96000)
        condition = int(max(8, min(99, round(rng.gauss(66, 18)))))
        pothole_180 = int(max(0, round((100 - condition) / 8 + traffic / 12000 + rng.random() * 8)))
        pothole_30 = int(max(0, round(pothole_180 / 6 + rng.random() * 4)))
        archetype = choose_archetype("road", rng)
        report_text = build_road_note(archetype, rng)
        repair_history = (
            ""
            if rng.random() < 0.2
            else "; ".join(
                [
                    f"{rng.choice(['mill and fill', 'full-depth patch', 'seal coat', 'drain rehab'])} "
                    f"{random_recent_date(1000, rng).date().isoformat()}"
                    for _ in range(rng.randint(1, 3))
                ]
            )
        )
        rows.append(
            {
                "asset_id": asset_id,
                "asset_type": "road",
                "name": f"Segment {rng.choice(['A', 'B', 'C', 'D'])}-{idx + 1}",
                "lat": lat,
                "lon": lon,
                "surface_type": rng.choice(ROAD_SURFACES),
                "traffic_estimate": traffic,
                "last_repair_date": random_recent_date(840, rng).date().isoformat(),
                "pothole_reports_30d": pothole_30,
                "pothole_reports_180d": max(pothole_30, pothole_180),
                "condition_index": condition,
                "report_text": report_text,
                "repair_history": repair_history,
                "images": maybe_image_url(asset_id, rng),
            }
        )
    return pd.DataFrame(rows)


def apply_hotspot_spikes(reports: list[dict[str, object]], hot_assets: Iterable[str], rng: random.Random) -> None:
    now = datetime.now(timezone.utc)
    for asset_id in hot_assets:
        for _ in range(rng.randint(9, 18)):
            report_type, phrase = choose_archetype("bridge" if asset_id.startswith("BRG-") else "road", rng)
            ts = now - timedelta(days=rng.randint(0, 11), hours=rng.randint(0, 23))
            reports.append(
                {
                    "report_id": f"RPT-{uuid.uuid4().hex[:10]}",
                    "asset_id": asset_id,
                    "created_at": ts.isoformat(),
                    "report_type": report_type,
                    "description": f"{phrase} Field note indicates accelerating trend after recent weather.",
                    "severity": rng.randint(3, 5),
                    "source": rng.choice(["inspection", "311", "contractor"]),
                }
            )


def generate_reports(bridges_df: pd.DataFrame, roads_df: pd.DataFrame, config: DatasetConfig) -> pd.DataFrame:
    rng = random.Random(config.seed + 13)
    asset_df = pd.concat([bridges_df, roads_df], ignore_index=True, sort=False)
    weights = []
    for _, row in asset_df.iterrows():
        if row["asset_type"] == "bridge":
            condition = (float(row["deck_rating"]) + float(row["superstructure_rating"]) + float(row["substructure_rating"])) / 3
            risk_hint = (9 - condition) / 9
            traffic = float(row["avg_daily_traffic"])
        else:
            risk_hint = (100 - float(row["condition_index"])) / 100
            traffic = float(row["traffic_estimate"])
        weights.append(0.6 + risk_hint * 1.9 + min(1.1, traffic / 120000))

    assets = asset_df[["asset_id", "asset_type", "lat", "lon"]].to_dict(orient="records")
    weights_np = np.array(weights, dtype=float)
    weights_np /= weights_np.sum()

    reports: list[dict[str, object]] = []
    now = datetime.now(timezone.utc)
    sources = ["311", "inspection", "contractor"]

    for _ in range(config.reports):
        idx = int(np.random.choice(len(assets), p=weights_np))
        asset = assets[idx]
        report_type, phrase = choose_archetype(str(asset["asset_type"]), rng)
        days_back = int(np.random.exponential(scale=55))
        days_back = max(0, min(365, days_back))
        ts = now - timedelta(days=days_back, hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
        severity = max(1, min(5, int(round(rng.gauss(2.8 + (report_type in {"sinkhole", "scour", "fatigue"}) * 0.8, 1.1)))))
        lat = float(asset["lat"]) + rng.uniform(-0.004, 0.004)
        lon = float(asset["lon"]) + rng.uniform(-0.004, 0.004)
        reports.append(
            {
                "report_id": f"RPT-{uuid.uuid4().hex[:10]}",
                "asset_id": asset["asset_id"],
                "created_at": ts.isoformat(),
                "report_type": report_type,
                "description": phrase,
                "severity": severity,
                "source": rng.choice(sources),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "image_url": maybe_image_url(str(asset["asset_id"]), rng),
            }
        )

    hot_assets = [a["asset_id"] for a in rng.sample(assets, k=min(28, len(assets)))]
    apply_hotspot_spikes(reports, hot_assets, rng)
    reports_df = pd.DataFrame(reports)
    reports_df = reports_df.sort_values("created_at", ascending=False).reset_index(drop=True)
    return reports_df


def maybe_generate_datasets(config: DatasetConfig, force: bool = False) -> None:
    if (
        BRIDGES_PATH.exists()
        and ROADS_PATH.exists()
        and REPORTS_PATH.exists()
        and not force
    ):
        return

    bridges_df = generate_bridges(config)
    roads_df = generate_roads(config)
    reports_df = generate_reports(bridges_df, roads_df, config)

    bridges_df.to_csv(BRIDGES_PATH, index=False)
    roads_df.to_csv(ROADS_PATH, index=False)
    reports_df.to_csv(REPORTS_PATH, index=False)


def parse_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def top_terms_for_cluster(
    centroid: np.ndarray,
    feature_names: np.ndarray,
    limit: int = 6,
) -> list[str]:
    idxs = np.argsort(centroid)[::-1][:limit]
    terms = [str(feature_names[i]) for i in idxs if centroid[i] > 0]
    return terms or ["infrastructure", "inspection"]


def infer_cluster_hypothesis(top_terms: List[str], cluster_size: int) -> str:
    text = " ".join(top_terms).lower()
    if any(token in text for token in ["drainage", "washout", "pooling", "inlet"]):
        return "Drainage-related degradation likely: repeated pooling/washout language with elevated report frequency."
    if any(token in text for token in ["corrosion", "spalling", "joint", "rebar"]):
        return "Structural deterioration likely: corrosion/spalling signals appear despite prior maintenance records."
    if any(token in text for token in ["pothole", "patch", "crack", "settlement", "sinkhole"]):
        return "Surface failure pattern likely: recurrent patch failure and cracking indicate deeper base instability."
    if any(token in text for token in ["fatigue", "bearing", "scour", "pier"]):
        return "Load-path stress pattern likely: fatigue/scour indicators suggest targeted structural review."
    return f"Recurring infrastructure issue cluster detected across {cluster_size} reports."


def build_assets_frame(bridges_df: pd.DataFrame, roads_df: pd.DataFrame, reports_df: pd.DataFrame) -> pd.DataFrame:
    bridge_assets = bridges_df.copy()
    bridge_assets["condition_index"] = (
        bridge_assets[["deck_rating", "superstructure_rating", "substructure_rating"]]
        .astype(float)
        .mean(axis=1)
        * (100.0 / 9.0)
    ).round(2)
    bridge_assets["traffic_metric"] = bridge_assets["avg_daily_traffic"].astype(float)
    bridge_assets["event_text"] = (
        bridge_assets["inspection_notes"].fillna("").astype(str)
        + " "
        + bridge_assets["repair_history"].fillna("").astype(str)
    )

    road_assets = roads_df.copy()
    road_assets["traffic_metric"] = road_assets["traffic_estimate"].astype(float)
    road_assets["event_text"] = (
        road_assets["report_text"].fillna("").astype(str)
        + " "
        + road_assets["repair_history"].fillna("").astype(str)
    )

    assets = pd.concat([bridge_assets, road_assets], ignore_index=True, sort=False)
    assets["year_built"] = pd.to_numeric(assets["year_built"], errors="coerce")
    assets["condition_index"] = pd.to_numeric(assets["condition_index"], errors="coerce")
    assets["traffic_metric"] = pd.to_numeric(assets["traffic_metric"], errors="coerce")
    assets["lat"] = pd.to_numeric(assets["lat"], errors="coerce")
    assets["lon"] = pd.to_numeric(assets["lon"], errors="coerce")
    assets["last_inspection_date"] = assets["last_inspection_date"].fillna("")
    assets["last_repair_date"] = assets["last_repair_date"].fillna("")
    assets["report_30d"] = 0
    assets["report_180d"] = 0

    reports = reports_df.copy()
    reports["created_at"] = parse_datetime(reports["created_at"])
    now = datetime.now(timezone.utc)
    recent_30 = reports[reports["created_at"] >= (now - timedelta(days=30))]
    recent_180 = reports[reports["created_at"] >= (now - timedelta(days=180))]
    count_30 = recent_30.groupby("asset_id").size().rename("report_30d")
    count_180 = recent_180.groupby("asset_id").size().rename("report_180d")
    assets = assets.merge(count_30, on="asset_id", how="left", suffixes=("", "_new"))
    assets = assets.merge(count_180, on="asset_id", how="left", suffixes=("", "_newer"))
    assets["report_30d"] = assets["report_30d_new"].fillna(0).astype(int)
    assets["report_180d"] = assets["report_180d_newer"].fillna(0).astype(int)
    assets = assets.drop(columns=[c for c in assets.columns if c.endswith("_new") or c.endswith("_newer")], errors="ignore")

    current_year = datetime.now(timezone.utc).year
    assets["age_years"] = (current_year - assets["year_built"]).clip(lower=1).fillna(20)
    assets["condition_norm"] = (assets["condition_index"] / 100.0).clip(lower=0.0, upper=1.0).fillna(0.5)
    assets["activity_ratio"] = ((assets["report_30d"] + 1) / ((assets["report_180d"] / 6.0) + 1)).clip(lower=0.0, upper=6.0)
    assets["asset_text"] = (
        assets["name"].fillna("").astype(str)
        + ". "
        + assets["event_text"].fillna("").astype(str)
    ).str.strip()

    return assets


def train_artifacts() -> Dict[str, object]:
    bridges_df = pd.read_csv(BRIDGES_PATH)
    roads_df = pd.read_csv(ROADS_PATH)
    reports_df = pd.read_csv(REPORTS_PATH)

    assets_df = build_assets_frame(bridges_df, roads_df, reports_df)
    reports_df["description"] = reports_df["description"].fillna("").astype(str)

    text_corpus = pd.concat([assets_df["asset_text"], reports_df["description"]], ignore_index=True).fillna("")
    vectorizer = TfidfVectorizer(max_features=4500, ngram_range=(1, 2), stop_words="english")
    vectorizer.fit(text_corpus.tolist())

    asset_tfidf = vectorizer.transform(assets_df["asset_text"].tolist())
    report_tfidf = vectorizer.transform(reports_df["description"].tolist())

    imputer = SimpleImputer(strategy="median")
    structured_values = imputer.fit_transform(assets_df[STRUCTURED_COLS])
    scaler = StandardScaler()
    structured_matrix = scaler.fit_transform(structured_values)

    n_clusters = max(8, min(12, max(8, len(reports_df) // 350)))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
    cluster_labels = kmeans.fit_predict(report_tfidf)
    reports_df = reports_df.copy()
    reports_df["cluster_id"] = cluster_labels

    feature_names = vectorizer.get_feature_names_out()
    cluster_summaries: list[dict[str, object]] = []
    for cluster_id in range(n_clusters):
        mask = cluster_labels == cluster_id
        cluster_size = int(mask.sum())
        centroid = kmeans.cluster_centers_[cluster_id]
        terms = top_terms_for_cluster(centroid, feature_names, limit=7)
        cluster_summaries.append(
            {
                "cluster_id": cluster_id,
                "size": cluster_size,
                "top_terms": terms,
                "cause_hypothesis": infer_cluster_hypothesis(terms, cluster_size),
            }
        )

    artifact = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "datasets": {
            "bridges_path": str(BRIDGES_PATH),
            "roads_path": str(ROADS_PATH),
            "reports_path": str(REPORTS_PATH),
        },
        "assets_df": assets_df,
        "reports_df": reports_df,
        "vectorizer": vectorizer,
        "asset_tfidf": asset_tfidf,
        "report_tfidf": report_tfidf,
        "structured_cols": STRUCTURED_COLS,
        "imputer": imputer,
        "scaler": scaler,
        "structured_matrix": structured_matrix,
        "kmeans": kmeans,
        "cluster_summaries": cluster_summaries,
    }
    return artifact


def build_infra_artifacts(force: bool = False) -> Path:
    ensure_dirs()
    maybe_generate_datasets(DatasetConfig(), force=force)
    artifact = train_artifacts()
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, ARTIFACT_PATH)
    return ARTIFACT_PATH


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build InfraPulse datasets and artifact index.")
    parser.add_argument("--force", action="store_true", help="Regenerate datasets and artifacts.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    path = build_infra_artifacts(force=args.force)
    artifact = joblib.load(path)
    print(f"[ok] artifacts: {path}")
    print(
        "[ok] dataset rows:"
        f" bridges={len(pd.read_csv(BRIDGES_PATH))}"
        f" roads={len(pd.read_csv(ROADS_PATH))}"
        f" reports={len(pd.read_csv(REPORTS_PATH))}"
    )
    print(f"[ok] clusters={len(artifact['cluster_summaries'])}")


if __name__ == "__main__":
    main()
