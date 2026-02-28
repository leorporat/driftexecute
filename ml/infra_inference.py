from __future__ import annotations

import json
import math
import re
import uuid
from collections import defaultdict
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
    REPORTS_PATH,
    STRUCTURED_COLS,
    build_infra_artifacts,
)


NEW_REPORTS_PATH = FEEDBACK_DIR / "new_reports.jsonl"
FEEDBACK_PATH = FEEDBACK_DIR / "feedback.jsonl"

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


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")


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
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def score_severity_text(text: str) -> float:
    tokens = tokenize(text)
    if not tokens:
        return 0.0
    hits = sum(1 for token in tokens if token in SEVERITY_HINTS)
    weighted = sum(SEVERITY_HINTS.get(token, 0) for token in tokens)
    return clamp((hits / 8.0) + (weighted / 35.0))


@dataclass
class AssetScores:
    risk_score: float
    inconsistency_score: float
    activity_score: float
    confidence: float
    top_reason: str
    tags: list[str]


class InfraPulseEngine:
    def __init__(self, artifact_path: Path = ARTIFACT_PATH) -> None:
        self.artifact_path = artifact_path
        self.artifact = self._load_or_build_artifact()
        self.base_assets: pd.DataFrame = self.artifact["assets_df"].copy()
        self.base_reports: pd.DataFrame = self.artifact["reports_df"].copy()
        self.vectorizer = self.artifact["vectorizer"]
        self.asset_tfidf_base = self.artifact["asset_tfidf"]
        self.report_tfidf_base = self.artifact["report_tfidf"]
        self.imputer = self.artifact["imputer"]
        self.scaler = self.artifact["scaler"]
        self.kmeans = self.artifact["kmeans"]
        self.structured_cols = list(self.artifact.get("structured_cols", STRUCTURED_COLS))
        self.cluster_summaries = self.artifact["cluster_summaries"]
        self.action_weights = self._load_action_weights()
        self.refresh_runtime()

    def _load_or_build_artifact(self) -> Dict[str, Any]:
        if not self.artifact_path.exists():
            build_infra_artifacts(force=False)
        return joblib.load(self.artifact_path)

    def _load_action_weights(self) -> Dict[str, float]:
        weights: Dict[str, float] = defaultdict(float)
        for row in read_jsonl(FEEDBACK_PATH):
            action = str(row.get("chosen_action", "")).strip()
            if not action:
                continue
            helpful = bool(row.get("helpful", False))
            weights[action] += 0.8 if helpful else -0.4
        return weights

    def refresh_runtime(self) -> None:
        extra_reports = pd.DataFrame(read_jsonl(NEW_REPORTS_PATH))
        if not extra_reports.empty:
            extra_reports["cluster_id"] = np.nan
            reports = pd.concat([self.base_reports, extra_reports], ignore_index=True, sort=False)
        else:
            reports = self.base_reports.copy()

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

    def _build_runtime_assets(self) -> pd.DataFrame:
        assets = self.base_assets.copy()
        now = now_utc()
        recent_30 = self.reports[self.reports["created_at"] >= (now - timedelta(days=30))]
        recent_180 = self.reports[self.reports["created_at"] >= (now - timedelta(days=180))]

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

        assets = assets.merge(count_30, on="asset_id", how="left")
        assets = assets.merge(count_180, on="asset_id", how="left")
        assets = assets.merge(severity_avg, on="asset_id", how="left")
        assets = assets.merge(latest_text, on="asset_id", how="left")

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
            baseline = 0.34 * condition_factor + 0.22 * age_norm + 0.22 * traffic_norm + 0.22 * report_norm

            activity_score = clamp((float(row["activity_ratio"]) - 1.0) / 3.0)

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
            risk_score = clamp(baseline + 0.22 * activity_score + 0.2 * inconsistency_score)

            top_similarity = [float(sims[n]) for n in neighbors[:3]] if neighbors else [0.0]
            confidence = clamp(float(np.mean(top_similarity)), 0.12, 0.98)

            reason_scores = {
                "condition deterioration": condition_factor,
                "activity spike": activity_score,
                "inconsistency mismatch": inconsistency_score,
                "age and load pressure": (age_norm + traffic_norm) / 2.0,
            }
            top_reason = max(reason_scores, key=reason_scores.get)
            tags = sorted(
                set(
                    [top_reason]
                    + [str(t) for t in tokenize(str(row.get("recent_report_text", ""))) if t in SEVERITY_HINTS]
                )
            )[:6]

            scores[str(row["asset_id"])] = AssetScores(
                risk_score=risk_score,
                inconsistency_score=inconsistency_score,
                activity_score=activity_score,
                confidence=confidence,
                top_reason=top_reason,
                tags=tags,
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
        actions = [
            "Schedule targeted field inspection within 7 days.",
            "Prioritize drainage and shoulder cleaning before next rainfall event.",
            "Issue temporary load/speed advisory pending structural follow-up.",
            "Order non-destructive testing for suspected internal deterioration.",
            "Bundle nearby work orders to reduce repeat patch cycles.",
        ]
        text = str(asset_payload.get("recent_report_text", "")).lower()
        if "drainage" in text or "washout" in text:
            actions.insert(0, "Deploy drainage crew and inspect outfalls within 48 hours.")
        if "corrosion" in text or "spalling" in text:
            actions.insert(0, "Perform corrosion mitigation and concrete patch plan review.")
        if "pothole" in text or "sinkhole" in text:
            actions.insert(0, "Execute emergency patch and base-layer integrity scan.")

        unique = []
        for action in actions:
            if action not in unique:
                unique.append(action)

        ranked = sorted(
            unique,
            key=lambda action: self.action_weights.get(action, 0.0),
            reverse=True,
        )
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
                    "inconsistency_score": details["inconsistency_score"],
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

        # default assetRisk without specific id: return highest risk assets
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

    def ingest_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        description = str(payload.get("description", "")).strip()
        if not description:
            raise ValueError("description is required")

        asset_id = payload.get("asset_id")
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

        report_type = infer_report_type(description)
        severity = payload.get("severity")
        if severity is None:
            severity = SEVERITY_HINTS.get(report_type, 3)
        severity = int(max(1, min(5, int(severity))))
        image_url = str(payload.get("image_url", "")).strip()
        source = str(payload.get("source", "manual"))
        report_id = f"RPT-{uuid.uuid4().hex[:10]}"

        record = {
            "report_id": report_id,
            "asset_id": asset_id,
            "created_at": now_utc().isoformat(),
            "report_type": report_type,
            "description": description,
            "severity": severity,
            "source": source,
            "lat": float(lat) if lat is not None else default_lat,
            "lon": float(lon) if lon is not None else default_lon,
            "image_url": image_url,
        }
        append_jsonl(NEW_REPORTS_PATH, record)
        self.refresh_runtime()

        updated = self._asset_record(asset_id)
        return {
            "ok": True,
            "report_id": report_id,
            "updated_asset": {
                "asset_id": asset_id,
                "risk_score": updated["risk_score"],
                "activity_score": updated["activity_score"],
                "inconsistency_score": updated["inconsistency_score"],
                "confidence": updated["confidence"],
            },
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
        append_jsonl(FEEDBACK_PATH, event)
        if chosen_action:
            self.action_weights[chosen_action] += 0.8 if helpful else -0.4
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
