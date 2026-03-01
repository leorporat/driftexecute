from __future__ import annotations

import csv
import io
import json
import math
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from ml.training.train_infra_index import (
    ARTIFACT_PATH,
    FEEDBACK_DIR,
    STRUCTURED_COLS,
    build_infra_artifacts,
)

DB_PATH = FEEDBACK_DIR / "infra_runtime.db"
ALLOWED_SOURCES = {"worker_log", "construction_update", "inspection", "manual", "voice", "311", "contractor"}

SEVERITY_HINTS = {
    "sinkhole": 5,
    "scour": 5,
    "fatigue": 4,
    "corrosion": 4,
    "spalling": 4,
    "joint": 3,
    "pothole": 3,
    "crack": 3,
    "drainage": 3,
    "washout": 4,
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value: Any) -> pd.Timestamp:
    return pd.to_datetime(value, errors="coerce", utc=True)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return float(max(low, min(high, value)))


def tokenize(text: str) -> list[str]:
    return [tok for tok in re.split(r"[^a-z0-9]+", text.lower()) if tok]


def infer_report_type(description: str) -> str:
    text = description.lower()
    for key in [
        "sinkhole",
        "scour",
        "fatigue",
        "corrosion",
        "spalling",
        "joint",
        "drainage",
        "washout",
        "pothole",
        "crack",
    ]:
        if key in text:
            if key == "joint":
                return "joint_failure"
            return key
    return "crack"


def infer_image_tags(report_type: str, image_url: str) -> list[str]:
    tags = [report_type]
    name_tokens = tokenize(image_url)
    for token in ["pothole", "crack", "spalling", "corrosion", "drainage", "washout", "scour", "fatigue"]:
        if token in name_tokens or token in image_url.lower():
            tags.append(token)
    return sorted(set(tags))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def score_severity_text(text: str) -> float:
    tokens = tokenize(text)
    if not tokens:
        return 0.0
    hits = sum(1 for token in tokens if token in SEVERITY_HINTS)
    weighted = sum(SEVERITY_HINTS.get(token, 0) for token in tokens)
    return clamp((hits / 8.0) + (weighted / 35.0))


def safety_band_for_score(score: float) -> str:
    if score < 0.30:
        return "low"
    if score < 0.55:
        return "guarded"
    if score < 0.75:
        return "elevated"
    return "critical"


def urgency_for_band(band: str) -> str:
    if band == "low":
        return "monitor"
    if band == "guarded":
        return "schedule_30d"
    if band == "elevated":
        return "schedule_7d"
    return "immediate_48h"


@dataclass
class AssetScores:
    risk_score: float
    inconsistency_score: float
    activity_score: float
    confidence: float
    top_reason: str
    tags: list[str]
    safety_band: str
    urgency: str
    risk_factors: list[str]


class RuntimeRepository:
    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._migrate()

    def _migrate(self) -> None:
        self.conn.executescript(
            """
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS reports_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              report_id TEXT NOT NULL UNIQUE,
              asset_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              report_type TEXT NOT NULL,
              description TEXT NOT NULL,
              severity INTEGER NOT NULL,
              source TEXT NOT NULL,
              lat REAL,
              lon REAL,
              image_url TEXT DEFAULT '',
              ingest_kind TEXT NOT NULL DEFAULT 'realtime'
            );

            CREATE TABLE IF NOT EXISTS feedback_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              asset_id TEXT NOT NULL,
              helpful INTEGER NOT NULL,
              reason TEXT DEFAULT '',
              chosen_action TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS action_weights (
              action TEXT PRIMARY KEY,
              weight REAL NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assets_snapshot (
              asset_id TEXT PRIMARY KEY,
              updated_at TEXT NOT NULL,
              risk_score REAL NOT NULL,
              safety_band TEXT NOT NULL,
              urgency TEXT NOT NULL,
              activity_score REAL NOT NULL,
              inconsistency_score REAL NOT NULL,
              confidence REAL NOT NULL,
              top_reason TEXT NOT NULL,
              risk_factors_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS model_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def set_metadata(self, key: str, value: str) -> None:
        self.conn.execute(
            """
            INSERT INTO model_metadata (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (key, value, now_utc().isoformat()),
        )
        self.conn.commit()

    def seed_reports(self, reports_df: pd.DataFrame) -> None:
        rows = []
        for _, row in reports_df.iterrows():
            report_id = str(row.get("report_id") or f"RPT-{uuid.uuid4().hex[:10]}")
            rows.append(
                (
                    report_id,
                    str(row.get("asset_id")),
                    str(parse_ts(row.get("created_at"))),
                    str(row.get("report_type") or "crack"),
                    str(row.get("description") or ""),
                    int(max(1, min(5, int(row.get("severity") or 3)))),
                    str(row.get("source") or "inspection"),
                    float(row.get("lat")) if pd.notna(row.get("lat")) else None,
                    float(row.get("lon")) if pd.notna(row.get("lon")) else None,
                    str(row.get("image_url") or ""),
                    "seed",
                )
            )

        self.conn.executemany(
            """
            INSERT OR IGNORE INTO reports_events
            (report_id, asset_id, created_at, report_type, description, severity, source, lat, lon, image_url, ingest_kind)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        self.conn.commit()

    def list_reports(self) -> pd.DataFrame:
        rows = self.conn.execute(
            """
            SELECT report_id, asset_id, created_at, report_type, description, severity, source, lat, lon, image_url
            FROM reports_events
            ORDER BY created_at DESC
            """
        ).fetchall()
        if not rows:
            return pd.DataFrame(
                columns=["report_id", "asset_id", "created_at", "report_type", "description", "severity", "source", "lat", "lon", "image_url"]
            )
        return pd.DataFrame([dict(r) for r in rows])

    def get_snapshot_risk(self, asset_id: str) -> Optional[float]:
        row = self.conn.execute("SELECT risk_score FROM assets_snapshot WHERE asset_id = ?", (asset_id,)).fetchone()
        if row is None:
            return None
        return float(row["risk_score"])

    def upsert_snapshot(self, payload: Dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO assets_snapshot
            (asset_id, updated_at, risk_score, safety_band, urgency, activity_score, inconsistency_score, confidence, top_reason, risk_factors_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(asset_id) DO UPDATE SET
              updated_at=excluded.updated_at,
              risk_score=excluded.risk_score,
              safety_band=excluded.safety_band,
              urgency=excluded.urgency,
              activity_score=excluded.activity_score,
              inconsistency_score=excluded.inconsistency_score,
              confidence=excluded.confidence,
              top_reason=excluded.top_reason,
              risk_factors_json=excluded.risk_factors_json
            """,
            (
                payload["asset_id"],
                payload["updated_at"],
                payload["risk_score"],
                payload["safety_band"],
                payload["urgency"],
                payload["activity_score"],
                payload["inconsistency_score"],
                payload["confidence"],
                payload["top_reason"],
                json.dumps(payload["risk_factors"]),
            ),
        )

    def add_report_event(self, payload: Dict[str, Any], ingest_kind: str = "realtime") -> str:
        report_id = str(payload.get("report_id") or f"RPT-{uuid.uuid4().hex[:10]}")
        self.conn.execute(
            """
            INSERT INTO reports_events
            (report_id, asset_id, created_at, report_type, description, severity, source, lat, lon, image_url, ingest_kind)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                payload["asset_id"],
                payload["created_at"],
                payload["report_type"],
                payload["description"],
                payload["severity"],
                payload["source"],
                payload.get("lat"),
                payload.get("lon"),
                payload.get("image_url") or "",
                ingest_kind,
            ),
        )
        return report_id

    def add_report_events(self, rows: List[Dict[str, Any]], ingest_kind: str = "batch") -> None:
        self.conn.executemany(
            """
            INSERT INTO reports_events
            (report_id, asset_id, created_at, report_type, description, severity, source, lat, lon, image_url, ingest_kind)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    row["report_id"],
                    row["asset_id"],
                    row["created_at"],
                    row["report_type"],
                    row["description"],
                    row["severity"],
                    row["source"],
                    row.get("lat"),
                    row.get("lon"),
                    row.get("image_url") or "",
                    ingest_kind,
                )
                for row in rows
            ],
        )

    def add_feedback_event(self, payload: Dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO feedback_events (created_at, asset_id, helpful, reason, chosen_action)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                payload["created_at"],
                payload["asset_id"],
                1 if payload["helpful"] else 0,
                payload.get("reason", ""),
                payload.get("chosen_action", ""),
            ),
        )

    def update_action_weight(self, action: str, delta: float) -> None:
        row = self.conn.execute("SELECT weight FROM action_weights WHERE action = ?", (action,)).fetchone()
        next_weight = float(row["weight"]) + delta if row else delta
        self.conn.execute(
            """
            INSERT INTO action_weights (action, weight, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(action) DO UPDATE SET weight=excluded.weight, updated_at=excluded.updated_at
            """,
            (action, next_weight, now_utc().isoformat()),
        )

    def load_action_weights(self) -> Dict[str, float]:
        rows = self.conn.execute("SELECT action, weight FROM action_weights").fetchall()
        return {str(r["action"]): float(r["weight"]) for r in rows}

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()


class InfraPulseEngine:
    def __init__(self, artifact_path: Path = ARTIFACT_PATH) -> None:
        self.artifact_path = artifact_path
        self.artifact = self._load_or_build_artifact()
        self.base_assets: pd.DataFrame = self.artifact["assets_df"].copy()
        self.base_reports: pd.DataFrame = self.artifact["reports_df"].copy()
        self.vectorizer = self.artifact["vectorizer"]
        self.imputer = self.artifact["imputer"]
        self.scaler = self.artifact["scaler"]
        self.kmeans = self.artifact["kmeans"]
        self.structured_cols = list(self.artifact.get("structured_cols", STRUCTURED_COLS))
        self.cluster_summaries = self.artifact["cluster_summaries"]

        self.repo = RuntimeRepository(DB_PATH)
        self.repo.seed_reports(self.base_reports)
        self.repo.set_metadata("risk_model", "hybrid_explainable_v1")
        self.repo.set_metadata(
            "risk_thresholds",
            json.dumps({"low": 0.30, "guarded": 0.55, "elevated": 0.75}),
        )

        self.action_weights = self.repo.load_action_weights()
        self.refresh_runtime()

    def _load_or_build_artifact(self) -> Dict[str, Any]:
        if not self.artifact_path.exists():
            build_infra_artifacts(force=False)
        return joblib.load(self.artifact_path)

    def refresh_runtime(self) -> None:
        reports = self.repo.list_reports()
        reports["created_at"] = parse_ts(reports["created_at"])
        reports["description"] = reports["description"].fillna("").astype(str)
        reports["report_type"] = reports["report_type"].fillna("crack").astype(str)
        reports["severity"] = pd.to_numeric(reports["severity"], errors="coerce").fillna(3).clip(1, 5).astype(int)
        reports["lat"] = pd.to_numeric(reports["lat"], errors="coerce")
        reports["lon"] = pd.to_numeric(reports["lon"], errors="coerce")
        reports = reports.dropna(subset=["asset_id"]).copy()
        reports = reports.sort_values("created_at", ascending=False).reset_index(drop=True)

        report_tfidf = self.vectorizer.transform(reports["description"].tolist())
        reports["cluster_id"] = self.kmeans.predict(report_tfidf)
        reports["image_tags"] = reports.apply(
            lambda row: infer_image_tags(str(row["report_type"]), str(row.get("image_url", ""))),
            axis=1,
        )

        self.reports = reports
        self.report_tfidf = report_tfidf

        self.assets = self._build_runtime_assets()
        self.asset_tfidf = self.vectorizer.transform(self.assets["asset_text"].tolist())
        structured_values = self.imputer.transform(self.assets[self.structured_cols])
        self.structured_matrix = self.scaler.transform(structured_values)
        self.asset_scores = self._compute_asset_scores()
        self.assets_updated_at = now_utc().isoformat()

        for asset_id, score in self.asset_scores.items():
            self.repo.upsert_snapshot(
                {
                    "asset_id": asset_id,
                    "updated_at": self.assets_updated_at,
                    "risk_score": score.risk_score,
                    "safety_band": score.safety_band,
                    "urgency": score.urgency,
                    "activity_score": score.activity_score,
                    "inconsistency_score": score.inconsistency_score,
                    "confidence": score.confidence,
                    "top_reason": score.top_reason,
                    "risk_factors": score.risk_factors,
                }
            )
        self.repo.commit()

    def _build_runtime_assets(self) -> pd.DataFrame:
        assets = self.base_assets.copy()
        now = now_utc()
        recent_7 = self.reports[self.reports["created_at"] >= (now - timedelta(days=7))]
        recent_30 = self.reports[self.reports["created_at"] >= (now - timedelta(days=30))]
        recent_180 = self.reports[self.reports["created_at"] >= (now - timedelta(days=180))]

        count_7 = recent_7.groupby("asset_id").size().rename("report_7d")
        count_30 = recent_30.groupby("asset_id").size().rename("report_30d_new")
        count_180 = recent_180.groupby("asset_id").size().rename("report_180d_new")
        severity_avg = recent_180.groupby("asset_id")["severity"].mean().rename("severity_avg")

        latest_text = (
            self.reports.sort_values("created_at", ascending=False)
            .groupby("asset_id")
            .head(4)
            .groupby("asset_id")["description"]
            .apply(lambda series: " ".join(series.astype(str).tolist()))
            .rename("recent_report_text")
        )

        assets = assets.merge(count_7, on="asset_id", how="left")
        assets = assets.merge(count_30, on="asset_id", how="left")
        assets = assets.merge(count_180, on="asset_id", how="left")
        assets = assets.merge(severity_avg, on="asset_id", how="left")
        assets = assets.merge(latest_text, on="asset_id", how="left")

        assets["report_7d"] = assets["report_7d"].fillna(0).astype(int)
        assets["report_30d"] = assets["report_30d_new"].fillna(assets["report_30d"]).fillna(0).astype(int)
        assets["report_180d"] = assets["report_180d_new"].fillna(assets["report_180d"]).fillna(0).astype(int)
        assets["severity_avg"] = assets["severity_avg"].fillna(2.3)
        assets["recent_report_text"] = assets["recent_report_text"].fillna("")
        assets["activity_ratio"] = ((assets["report_30d"] + 1) / ((assets["report_180d"] / 6.0) + 1)).clip(0, 8)
        assets["asset_text"] = (
            assets["name"].fillna("").astype(str)
            + ". "
            + assets["event_text"].fillna("").astype(str)
            + " "
            + assets["recent_report_text"].fillna("").astype(str)
        ).str.strip()

        return assets.drop(columns=["report_30d_new", "report_180d_new"], errors="ignore")

    def _asset_index(self, asset_id: str) -> int:
        matches = self.assets.index[self.assets["asset_id"] == asset_id].tolist()
        if not matches:
            raise KeyError(f"Asset not found: {asset_id}")
        return int(matches[0])

    def _compute_asset_scores(self) -> Dict[str, AssetScores]:
        scores: Dict[str, AssetScores] = {}
        if len(self.assets) == 0:
            return scores

        neighbor_sims = cosine_similarity(self.structured_matrix)
        condition_gap = 1.0 - self.assets["condition_norm"].astype(float).to_numpy()
        report_pressure = np.clip(self.assets["report_30d"].to_numpy() / 20.0, 0, 1)

        for idx, row in self.assets.iterrows():
            age_norm = clamp(float(row["age_years"]) / 95.0)
            traffic_norm = clamp(math.log1p(float(row["traffic_metric"])) / math.log1p(140000))
            condition_factor = clamp(1.0 - float(row["condition_norm"]))
            report_norm = clamp(float(row["report_30d"]) / 30.0)
            baseline = 0.32 * condition_factor + 0.22 * age_norm + 0.22 * traffic_norm + 0.24 * report_norm

            activity_score = clamp((float(row["activity_ratio"]) - 1.0) / 3.0)
            recency_boost = clamp(float(row.get("report_7d", 0)) / 10.0)

            text_severity = score_severity_text(str(row.get("recent_report_text", "")))
            mismatch_text = 0.0
            if float(row["condition_norm"]) > 0.72 and text_severity > 0.35:
                mismatch_text = min(0.45, 0.22 + text_severity * 0.4)

            sims = neighbor_sims[idx]
            order = np.argsort(sims)[::-1]
            neighbors = [n for n in order if n != idx][:8]
            neighbor_outcome = 0.0
            if neighbors:
                neighbor_outcome = float(np.mean(condition_gap[neighbors] * 0.6 + report_pressure[neighbors] * 0.4))

            own_outcome = condition_factor * 0.6 + report_norm * 0.4
            mismatch_neighbor = 0.0
            if float(row["condition_norm"]) > 0.65 and neighbor_outcome > own_outcome + 0.25:
                mismatch_neighbor = clamp(neighbor_outcome - own_outcome, 0, 0.38)

            repair_history = str(row.get("repair_history", "") or "")
            mismatch_trend = 0.0
            if float(row["condition_norm"]) > 0.75 and float(row["report_30d"]) >= 4 and len(repair_history.strip()) < 5:
                mismatch_trend = 0.22

            inconsistency_score = clamp(mismatch_text + mismatch_neighbor + mismatch_trend)
            risk_score = clamp(baseline + 0.2 * activity_score + 0.2 * inconsistency_score + 0.08 * recency_boost)

            top_similarity = [float(sims[n]) for n in neighbors[:3]] if neighbors else [0.0]
            confidence = clamp(float(np.mean(top_similarity)), 0.12, 0.98)

            reason_scores = {
                "condition deterioration": condition_factor,
                "activity spike": activity_score,
                "inconsistency mismatch": inconsistency_score,
                "age and load pressure": (age_norm + traffic_norm) / 2.0,
                "recency acceleration": recency_boost,
            }
            top_reason = max(reason_scores, key=reason_scores.get)
            risk_factors = [name for name, _ in sorted(reason_scores.items(), key=lambda item: item[1], reverse=True)[:3]]
            tags = sorted(
                set([top_reason] + [str(t) for t in tokenize(str(row.get("recent_report_text", ""))) if t in SEVERITY_HINTS])
            )[:6]

            safety_band = safety_band_for_score(risk_score)
            urgency = urgency_for_band(safety_band)

            scores[str(row["asset_id"])] = AssetScores(
                risk_score=risk_score,
                inconsistency_score=inconsistency_score,
                activity_score=activity_score,
                confidence=confidence,
                top_reason=top_reason,
                tags=tags,
                safety_band=safety_band,
                urgency=urgency,
                risk_factors=risk_factors,
            )

        return scores

    def _asset_record(self, asset_id: str) -> Dict[str, Any]:
        idx = self._asset_index(asset_id)
        row = self.assets.iloc[idx]
        scores = self.asset_scores[asset_id]
        payload = row.to_dict()
        payload.update(
            {
                "risk_score": scores.risk_score,
                "inconsistency_score": scores.inconsistency_score,
                "activity_score": scores.activity_score,
                "confidence": scores.confidence,
                "top_reason": scores.top_reason,
                "tags": scores.tags,
                "safety_band": scores.safety_band,
                "urgency": scores.urgency,
                "risk_factors": scores.risk_factors,
                "last_updated": self.assets_updated_at,
            }
        )
        return payload

    def map_assets_geojson(self, asset_type: str = "all") -> Dict[str, Any]:
        allowed = {"all", "road", "bridge"}
        if asset_type not in allowed:
            raise ValueError(f"Invalid type '{asset_type}'. Expected one of {sorted(allowed)}.")

        rows = self.assets
        if asset_type != "all":
            rows = rows[rows["asset_type"] == asset_type]

        features: list[dict[str, Any]] = []
        for _, row in rows.iterrows():
            asset_id = str(row["asset_id"])
            scores = self.asset_scores.get(asset_id)
            if not scores:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(row["lon"]), float(row["lat"])],
                    },
                    "properties": {
                        "asset_id": asset_id,
                        "asset_type": row["asset_type"],
                        "name": row["name"],
                        "risk_score": scores.risk_score,
                        "safety_band": scores.safety_band,
                        "urgency": scores.urgency,
                        "risk_factors": scores.risk_factors,
                        "inconsistency_score": scores.inconsistency_score,
                        "activity_score": scores.activity_score,
                        "top_reason": scores.top_reason,
                        "tags": scores.tags,
                        "last_updated": self.assets_updated_at,
                    },
                }
            )
        return {"type": "FeatureCollection", "features": features}

    def _cluster_summary_map(self) -> Dict[int, Dict[str, Any]]:
        return {int(item["cluster_id"]): item for item in self.cluster_summaries}

    def _cause_hypotheses_for_asset(self, asset_id: str, max_items: int = 4) -> List[str]:
        reports = self.reports[self.reports["asset_id"] == asset_id]
        if reports.empty:
            return ["No recurring pattern yet. Collect more inspection notes for stronger signal."]

        counts = reports.groupby("cluster_id").size().sort_values(ascending=False).head(max_items)
        summary_map = self._cluster_summary_map()
        hypotheses = []
        for cluster_id, size in counts.items():
            base = summary_map.get(int(cluster_id), {})
            phrase = str(base.get("cause_hypothesis", "Recurring report pattern detected."))
            terms = ", ".join(base.get("top_terms", [])[:4])
            hypotheses.append(f"{phrase} Key terms: {terms}. Affected reports: {int(size)}.")
        return hypotheses

    def _recommended_actions(self, asset_payload: Dict[str, Any]) -> List[str]:
        urgency = str(asset_payload.get("urgency", "monitor"))
        text = str(asset_payload.get("recent_report_text", "")).lower()

        hazard_actions = {
            "pothole": [
                "Execute emergency patch and base-layer integrity scan.",
                "Deploy temporary lane safety controls and monitor settlement.",
            ],
            "sinkhole": [
                "Initiate geotechnical assessment and immediate cavity stabilization.",
                "Restrict heavy loads until void remediation is complete.",
            ],
            "drainage": [
                "Deploy drainage crew and inspect outfalls within 48 hours.",
                "Clear inlets and regrade shoulder runoff channels.",
            ],
            "washout": [
                "Stabilize embankment and reinforce edge protection before next rainfall.",
                "Inspect culvert capacity and erosion controls.",
            ],
            "corrosion": [
                "Perform corrosion mitigation and concrete patch plan review.",
                "Schedule NDT to assess section loss and hidden deterioration.",
            ],
            "spalling": [
                "Perform concrete delamination survey and targeted patch repair.",
                "Inspect joint leakage and seal vulnerable deck zones.",
            ],
            "joint": [
                "Inspect and reseal expansion joints to stop accelerated ingress.",
                "Prioritize bearing and support inspection near failed joints.",
            ],
            "fatigue": [
                "Order non-destructive fatigue testing at critical details.",
                "Issue temporary load advisory pending structural follow-up.",
            ],
            "scour": [
                "Conduct underwater foundation inspection for scour depth verification.",
                "Install interim scour countermeasures at vulnerable piers.",
            ],
        }

        base = [
            "Schedule targeted field inspection within 7 days.",
            "Bundle nearby work orders to reduce repeat patch cycles.",
            "Update maintenance plan with observed failure trend signals.",
        ]

        prioritized: list[str] = []
        for key, actions in hazard_actions.items():
            if key in text:
                prioritized.extend(actions)

        if urgency == "immediate_48h":
            prioritized.insert(0, "Dispatch rapid-response crew and implement immediate hazard controls.")
        elif urgency == "schedule_7d":
            prioritized.insert(0, "Issue prioritized work order for completion within 7 days.")

        actions = prioritized + base
        unique: list[str] = []
        for action in actions:
            if action not in unique:
                unique.append(action)

        ranked = sorted(unique, key=lambda action: self.action_weights.get(action, 0.0), reverse=True)
        return ranked[:5]

    def _similar_assets(self, asset_id: str, top_k: int = 5) -> List[Dict[str, Any]]:
        idx = self._asset_index(asset_id)
        query = self.structured_matrix[idx : idx + 1]
        sims = cosine_similarity(query, self.structured_matrix)[0]
        order = np.argsort(sims)[::-1]
        out: list[dict[str, Any]] = []
        for candidate in order:
            if candidate == idx:
                continue
            row = self.assets.iloc[int(candidate)]
            candidate_id = str(row["asset_id"])
            score = self.asset_scores.get(candidate_id)
            if not score:
                continue
            out.append(
                {
                    "asset_id": candidate_id,
                    "name": row["name"],
                    "asset_type": row["asset_type"],
                    "similarity": round(float(sims[candidate]), 4),
                    "risk_score": round(score.risk_score, 4),
                }
            )
            if len(out) >= top_k:
                break
        return out

    def _similar_incidents(self, asset_id: str, top_k: int = 8) -> List[Dict[str, Any]]:
        idx = self._asset_index(asset_id)
        query_text = str(self.assets.iloc[idx]["asset_text"])
        query_vec = self.vectorizer.transform([query_text])
        sims = cosine_similarity(query_vec, self.report_tfidf)[0]
        order = np.argsort(sims)[::-1][: top_k * 2]
        out: list[dict[str, Any]] = []
        for candidate in order:
            score = float(sims[candidate])
            if score <= 0.03:
                continue
            row = self.reports.iloc[int(candidate)].to_dict()
            out.append(
                {
                    "report_id": row.get("report_id"),
                    "asset_id": row.get("asset_id"),
                    "created_at": str(row.get("created_at")),
                    "report_type": row.get("report_type"),
                    "description": row.get("description"),
                    "severity": int(row.get("severity", 3)),
                    "source": row.get("source"),
                    "image_url": row.get("image_url"),
                    "image_tags": row.get("image_tags", []),
                    "cluster_id": int(row.get("cluster_id", -1)),
                    "similarity": round(score, 4),
                }
            )
            if len(out) >= top_k:
                break
        return out

    def asset_details(self, asset_id: str, last_n_reports: int = 12) -> Dict[str, Any]:
        record = self._asset_record(asset_id)
        reports = (
            self.reports[self.reports["asset_id"] == asset_id]
            .sort_values("created_at", ascending=False)
            .head(last_n_reports)
            .copy()
        )
        reports_payload = []
        for _, row in reports.iterrows():
            reports_payload.append(
                {
                    "report_id": row.get("report_id"),
                    "created_at": str(row.get("created_at")),
                    "report_type": row.get("report_type"),
                    "description": row.get("description"),
                    "severity": int(row.get("severity", 3)),
                    "source": row.get("source"),
                    "lat": float(row.get("lat")) if pd.notna(row.get("lat")) else None,
                    "lon": float(row.get("lon")) if pd.notna(row.get("lon")) else None,
                    "image_url": row.get("image_url"),
                    "image_tags": row.get("image_tags", []),
                    "cluster_id": int(row.get("cluster_id", -1)),
                }
            )

        return {
            "asset": record,
            "last_reports": reports_payload,
            "similar_assets": self._similar_assets(asset_id, top_k=6),
            "similar_incidents": self._similar_incidents(asset_id, top_k=10),
            "risk_score": record["risk_score"],
            "safety_band": record["safety_band"],
            "urgency": record["urgency"],
            "risk_factors": record["risk_factors"],
            "inconsistency_score": record["inconsistency_score"],
            "confidence": record["confidence"],
            "cause_hypotheses": self._cause_hypotheses_for_asset(asset_id, max_items=4),
            "recommended_actions": self._recommended_actions(record),
        }

    def area_hotspots(
        self,
        lat: Optional[float],
        lon: Optional[float],
        radius_km: Optional[float],
        top_k: int = 20,
    ) -> List[Dict[str, Any]]:
        candidates = self.assets.copy()
        if lat is not None and lon is not None:
            radius = float(radius_km or 6.0)
            distances = candidates.apply(
                lambda row: haversine_km(float(lat), float(lon), float(row["lat"]), float(row["lon"])),
                axis=1,
            )
            candidates = candidates.assign(distance_km=distances)
            candidates = candidates[candidates["distance_km"] <= radius]
        else:
            candidates = candidates.assign(distance_km=np.nan)

        scored: list[dict[str, Any]] = []
        for _, row in candidates.iterrows():
            asset_id = str(row["asset_id"])
            score = self.asset_scores.get(asset_id)
            if not score:
                continue
            scored.append(
                {
                    "asset_id": asset_id,
                    "name": row["name"],
                    "asset_type": row["asset_type"],
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "distance_km": None if pd.isna(row["distance_km"]) else round(float(row["distance_km"]), 2),
                    "risk_score": round(score.risk_score, 4),
                    "safety_band": score.safety_band,
                    "urgency": score.urgency,
                    "risk_factors": score.risk_factors,
                    "activity_score": round(score.activity_score, 4),
                    "inconsistency_score": round(score.inconsistency_score, 4),
                    "top_reason": score.top_reason,
                    "tags": score.tags,
                }
            )
        scored.sort(key=lambda item: (item["risk_score"], item["activity_score"]), reverse=True)
        return scored[:top_k]

    def report_clusters(self) -> List[Dict[str, Any]]:
        now = now_utc()
        recent_30 = self.reports[self.reports["created_at"] >= (now - timedelta(days=30))]
        recent_7 = self.reports[self.reports["created_at"] >= (now - timedelta(days=7))]
        if recent_30.empty:
            return []

        map_summary = self._cluster_summary_map()
        out: list[dict[str, Any]] = []
        counts_30 = recent_30.groupby("cluster_id").size().sort_values(ascending=False)
        counts_7 = recent_7.groupby("cluster_id").size()

        for cluster_id, count_30 in counts_30.head(12).items():
            subset = recent_30[recent_30["cluster_id"] == cluster_id]
            lat = pd.to_numeric(subset["lat"], errors="coerce").mean()
            lon = pd.to_numeric(subset["lon"], errors="coerce").mean()
            assets_count = int(subset["asset_id"].nunique())
            summary = map_summary.get(int(cluster_id), {})
            out.append(
                {
                    "cluster_id": int(cluster_id),
                    "count_30d": int(count_30),
                    "count_7d": int(counts_7.get(cluster_id, 0)),
                    "affected_assets": assets_count,
                    "top_terms": summary.get("top_terms", []),
                    "cause_hypothesis": summary.get("cause_hypothesis", "Recurring risk pattern detected."),
                    "center_lat": None if pd.isna(lat) else float(round(lat, 6)),
                    "center_lon": None if pd.isna(lon) else float(round(lon, 6)),
                }
            )
        return out

    def recommend(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        mode = str(payload.get("type", "assetRisk"))
        asset_id = payload.get("asset_id")
        lat = payload.get("lat")
        lon = payload.get("lon")
        radius_km = payload.get("radius_km")
        text = str(payload.get("text", "")).strip()

        if asset_id:
            details = self.asset_details(str(asset_id))
            return {
                "results": details,
                "summary": {
                    "mode": "assetRisk",
                    "asset_id": asset_id,
                    "risk_score": details["risk_score"],
                    "safety_band": details["safety_band"],
                    "urgency": details["urgency"],
                },
                "debug": {"query_text": text},
            }

        if mode == "areaHotspot":
            hotspots = self.area_hotspots(
                lat=float(lat) if lat is not None else None,
                lon=float(lon) if lon is not None else None,
                radius_km=float(radius_km) if radius_km is not None else None,
                top_k=25,
            )
            return {
                "results": hotspots,
                "summary": {"mode": mode, "count": len(hotspots)},
                "debug": {"lat": lat, "lon": lon, "radius_km": radius_km},
            }

        if mode == "reportCluster":
            clusters = self.report_clusters()
            return {
                "results": clusters,
                "summary": {"mode": mode, "count": len(clusters)},
                "debug": {},
            }

        top_assets = self.area_hotspots(lat=None, lon=None, radius_km=None, top_k=20)
        return {
            "results": top_assets,
            "summary": {"mode": "assetRisk", "count": len(top_assets)},
            "debug": {"query_text": text},
        }

    def _find_closest_asset(self, lat: float, lon: float) -> Optional[str]:
        if len(self.assets) == 0:
            return None
        distances = self.assets.apply(
            lambda row: haversine_km(lat, lon, float(row["lat"]), float(row["lon"])),
            axis=1,
        )
        idx = int(distances.idxmin())
        return str(self.assets.iloc[idx]["asset_id"])

    def _normalize_event_input(self, payload: Dict[str, Any], fallback_asset_id: Optional[str] = None) -> Dict[str, Any]:
        description = str(payload.get("description", "")).strip()
        if not description:
            raise ValueError("description is required")

        asset_id = payload.get("asset_id") or fallback_asset_id
        lat = payload.get("lat")
        lon = payload.get("lon")
        if asset_id is None and lat is not None and lon is not None:
            asset_id = self._find_closest_asset(float(lat), float(lon))
        if not asset_id:
            raise ValueError("asset_id is required when location is not provided")
        asset_id = str(asset_id)

        try:
            row = self.assets[self.assets["asset_id"] == asset_id].iloc[0]
            default_lat = float(row["lat"])
            default_lon = float(row["lon"])
        except Exception:
            default_lat = None
            default_lon = None

        report_type = str(payload.get("report_type") or infer_report_type(description))
        severity = payload.get("severity")
        if severity is None:
            severity = SEVERITY_HINTS.get(report_type, 3)
        severity = int(max(1, min(5, int(severity))))

        source = str(payload.get("source", "manual")).strip().lower() or "manual"
        if source not in ALLOWED_SOURCES:
            raise ValueError(f"source must be one of: {sorted(ALLOWED_SOURCES)}")

        created_at = payload.get("created_at")
        created_at_iso = str(parse_ts(created_at)) if created_at else now_utc().isoformat()

        return {
            "report_id": str(payload.get("report_id") or f"RPT-{uuid.uuid4().hex[:10]}"),
            "asset_id": asset_id,
            "created_at": created_at_iso,
            "report_type": report_type,
            "description": description,
            "severity": severity,
            "source": source,
            "lat": float(lat) if lat is not None else default_lat,
            "lon": float(lon) if lon is not None else default_lon,
            "image_url": str(payload.get("image_url", "")).strip(),
        }

    def ingest_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = self._normalize_event_input(payload)
        prior_risk = self.repo.get_snapshot_risk(normalized["asset_id"])

        try:
            report_id = self.repo.add_report_event(normalized, ingest_kind="realtime")
            self.repo.commit()
        except sqlite3.IntegrityError as exc:
            self.repo.rollback()
            raise ValueError(f"duplicate report_id: {normalized['report_id']}") from exc

        self.refresh_runtime()

        updated = self._asset_record(normalized["asset_id"])
        risk_delta_24h = 0.0 if prior_risk is None else round(float(updated["risk_score"]) - float(prior_risk), 4)

        return {
            "ok": True,
            "report_id": report_id,
            "updated_asset": {
                "asset_id": normalized["asset_id"],
                "risk_score": updated["risk_score"],
                "safety_band": updated["safety_band"],
                "urgency": updated["urgency"],
                "risk_factors": updated["risk_factors"],
                "risk_delta_24h": risk_delta_24h,
                "activity_score": updated["activity_score"],
                "inconsistency_score": updated["inconsistency_score"],
                "confidence": updated["confidence"],
            },
        }

    def ingest_batch(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        rows_input = payload.get("rows")
        csv_text = payload.get("csv_text")

        parsed_rows: list[dict[str, Any]] = []
        if isinstance(rows_input, list):
            parsed_rows = [row for row in rows_input if isinstance(row, dict)]
        elif isinstance(csv_text, str) and csv_text.strip():
            reader = csv.DictReader(io.StringIO(csv_text))
            parsed_rows = [dict(row) for row in reader]
        else:
            raise ValueError("Provide either rows (array) or csv_text (string)")

        if not parsed_rows:
            raise ValueError("No rows provided for batch ingestion")

        normalized_rows = [self._normalize_event_input(row) for row in parsed_rows]
        impacted_assets = sorted(set(row["asset_id"] for row in normalized_rows))
        prior_snapshot = {asset_id: self.repo.get_snapshot_risk(asset_id) for asset_id in impacted_assets}

        try:
            self.repo.add_report_events(normalized_rows, ingest_kind="batch")
            self.repo.commit()
        except sqlite3.IntegrityError as exc:
            self.repo.rollback()
            raise ValueError("Batch insert failed due to duplicate report_id") from exc

        self.refresh_runtime()

        changed_assets = []
        for asset_id in impacted_assets:
            updated = self._asset_record(asset_id)
            previous = prior_snapshot.get(asset_id)
            delta = 0.0 if previous is None else round(float(updated["risk_score"]) - float(previous), 4)
            changed_assets.append(
                {
                    "asset_id": asset_id,
                    "risk_score": updated["risk_score"],
                    "safety_band": updated["safety_band"],
                    "urgency": updated["urgency"],
                    "risk_delta_24h": delta,
                }
            )

        changed_assets.sort(key=lambda item: abs(float(item["risk_delta_24h"])), reverse=True)

        return {
            "ok": True,
            "ingested_count": len(normalized_rows),
            "impacted_assets_count": len(impacted_assets),
            "top_changed_assets": changed_assets[:20],
        }

    def submit_feedback(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        asset_id = str(payload.get("asset_id", "")).strip()
        if not asset_id:
            raise ValueError("asset_id is required")

        helpful = bool(payload.get("helpful", False))
        reason = str(payload.get("reason", "")).strip()
        chosen_action = str(payload.get("chosen_action", "")).strip()

        event = {
            "created_at": now_utc().isoformat(),
            "asset_id": asset_id,
            "helpful": helpful,
            "reason": reason,
            "chosen_action": chosen_action,
        }

        self.repo.add_feedback_event(event)
        if chosen_action:
            delta = 0.8 if helpful else -0.4
            self.repo.update_action_weight(chosen_action, delta)
            self.action_weights[chosen_action] = self.action_weights.get(chosen_action, 0.0) + delta
        self.repo.commit()

        return {"ok": True, "asset_id": asset_id}

    def sample_examples(self) -> Dict[str, Any]:
        top = sorted(self.asset_scores.items(), key=lambda item: item[1].risk_score, reverse=True)[:5]
        return {
            "asset_ids": [asset_id for asset_id, _ in top],
            "voice_notes": [
                "Observed repeated pothole rebound after patching near the northbound lane shoulder.",
                "Bridge deck shows corrosion staining and fresh spalling near expansion joint.",
                "Drainage inlet blocked; pooling and edge washout worsening after rainfall.",
            ],
        }


@lru_cache(maxsize=1)
def get_engine() -> InfraPulseEngine:
    return InfraPulseEngine()


def force_reload_engine() -> InfraPulseEngine:
    get_engine.cache_clear()
    return get_engine()
