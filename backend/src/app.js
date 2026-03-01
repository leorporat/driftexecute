import cors from "cors";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const ML_API_BASE_URL = process.env.ML_API_BASE_URL || "http://127.0.0.1:8001";

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  }),
);
app.use(express.json({ limit: "10mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FALLBACK_GEOJSON_PATH = path.resolve(__dirname, "../../driftexecute/public/infra/fallback-assets.geojson");

let fallbackState = null;

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function safetyBandForScore(score) {
  if (score < 0.3) return "low";
  if (score < 0.55) return "guarded";
  if (score < 0.75) return "elevated";
  return "critical";
}

function urgencyForBand(band) {
  if (band === "low") return "monitor";
  if (band === "guarded") return "schedule_30d";
  if (band === "elevated") return "schedule_7d";
  return "immediate_48h";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371.0;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function getFallbackState() {
  if (fallbackState) return fallbackState;
  const raw = await readFile(FALLBACK_GEOJSON_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const features = (parsed.features || []).map((feature) => {
    const riskScore = Number(feature?.properties?.risk_score || 0);
    const safetyBand = feature?.properties?.safety_band || safetyBandForScore(riskScore);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        safety_band: safetyBand,
        urgency: feature?.properties?.urgency || urgencyForBand(safetyBand),
        risk_factors: Array.isArray(feature?.properties?.risk_factors)
          ? feature.properties.risk_factors
          : [feature?.properties?.top_reason || "condition deterioration"],
      },
    };
  });
  fallbackState = {
    geojson: { type: "FeatureCollection", features },
    reportsByAsset: Object.create(null),
  };
  return fallbackState;
}

function buildFallbackAssetDetails(state, assetId) {
  const feature = state.geojson.features.find((item) => item?.properties?.asset_id === assetId);
  if (!feature) return null;
  const props = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;
  const reports = state.reportsByAsset[assetId] || [];

  return {
    asset: {
      asset_id: props.asset_id,
      asset_type: props.asset_type,
      name: props.name,
      lat,
      lon,
      risk_score: props.risk_score,
      safety_band: props.safety_band,
      urgency: props.urgency,
      risk_factors: props.risk_factors,
      activity_score: props.activity_score,
      inconsistency_score: props.inconsistency_score,
      confidence: 0.5,
      top_reason: props.top_reason,
      tags: props.tags || [],
    },
    last_reports: reports.slice(-12).reverse(),
    similar_assets: [],
    similar_incidents: [],
    risk_score: props.risk_score,
    safety_band: props.safety_band,
    urgency: props.urgency,
    risk_factors: props.risk_factors,
    inconsistency_score: props.inconsistency_score,
    confidence: 0.5,
    cause_hypotheses: [
      "Running in backend offline inference fallback mode (ML API unavailable).",
      `Primary signal detected: ${props.top_reason || "condition deterioration"}.`,
    ],
    recommended_actions: [
      "Schedule targeted field inspection within 7 days.",
      "Bundle nearby work orders to reduce repeat patch cycles.",
      "Update maintenance plan with observed trend changes.",
    ],
  };
}

function fallbackAreaHotspots(state, { lat, lon, radius_km }) {
  const radius = Number(radius_km || 10);
  const rows = state.geojson.features.map((feature) => {
    const [xLon, xLat] = feature.geometry.coordinates;
    const distance =
      typeof lat === "number" && typeof lon === "number"
        ? haversineKm(Number(lat), Number(lon), Number(xLat), Number(xLon))
        : null;
    return {
      asset_id: feature.properties.asset_id,
      name: feature.properties.name,
      asset_type: feature.properties.asset_type,
      lat: xLat,
      lon: xLon,
      distance_km: distance == null ? null : Number(distance.toFixed(2)),
      risk_score: feature.properties.risk_score,
      safety_band: feature.properties.safety_band,
      urgency: feature.properties.urgency,
      risk_factors: feature.properties.risk_factors,
      activity_score: feature.properties.activity_score,
      inconsistency_score: feature.properties.inconsistency_score,
      top_reason: feature.properties.top_reason,
      tags: feature.properties.tags || [],
    };
  });

  return rows
    .filter((row) => row.distance_km == null || row.distance_km <= radius)
    .sort((a, b) => b.risk_score - a.risk_score || b.activity_score - a.activity_score)
    .slice(0, 25);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function proxyMl(pathname, init = {}) {
  const response = await fetch(`${ML_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { error: "Invalid response from ML API" };
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || "ML API request failed";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

app.get("/api/map/assets", async (req, res) => {
  const type = String(req.query.type || "all");
  try {
    const payload = await proxyMl(`/map/assets?type=${encodeURIComponent(type)}`);
    res.json(payload);
  } catch {
    const state = await getFallbackState();
    const features =
      type === "all"
        ? state.geojson.features
        : state.geojson.features.filter((feature) => feature?.properties?.asset_type === type);
    res.json({ type: "FeatureCollection", features, meta: { fallback: true } });
  }
});

app.get("/api/asset/:id", async (req, res) => {
  const assetId = decodeURIComponent(req.params.id);
  try {
    const payload = await proxyMl(`/asset/${encodeURIComponent(req.params.id)}`);
    res.json(payload);
  } catch {
    const state = await getFallbackState();
    const details = buildFallbackAssetDetails(state, assetId);
    if (!details) {
      res.status(404).json({ error: `Asset not found: ${assetId}` });
      return;
    }
    res.json({ ...details, meta: { fallback: true } });
  }
});

app.post("/api/recommend", async (req, res) => {
  try {
    const payload = await proxyMl("/recommend", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch {
    const input = req.body || {};
    const state = await getFallbackState();
    const mode = String(input.type || "assetRisk");

    if (mode === "reportCluster") {
      res.json({
        results: [
          {
            cluster_id: 0,
            count_30d: state.geojson.features.length,
            count_7d: Math.max(1, Math.floor(state.geojson.features.length / 2)),
            affected_assets: state.geojson.features.length,
            top_terms: ["pothole", "corrosion", "drainage"],
            cause_hypothesis: "Offline fallback cluster derived from local sample assets.",
            center_lat: 41.8781,
            center_lon: -87.6298,
          },
        ],
        summary: { mode, count: 1 },
        debug: { fallback: true },
      });
      return;
    }

    if (mode === "areaHotspot") {
      const hotspots = fallbackAreaHotspots(state, input || {});
      res.json({
        results: hotspots,
        summary: { mode, count: hotspots.length },
        debug: { fallback: true },
      });
      return;
    }

    const hotspots = fallbackAreaHotspots(state, {});
    res.json({
      results: hotspots,
      summary: { mode: "assetRisk", count: hotspots.length },
      debug: { fallback: true },
    });
  }
});

app.post("/api/reports/ingest", async (req, res) => {
  try {
    const payload = await proxyMl("/reports/ingest", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch {
    const state = await getFallbackState();
    const description = String(req.body?.description || "").trim();
    if (!description) {
      res.status(400).json({ error: "description is required" });
      return;
    }
    let assetId = String(req.body?.asset_id || "").trim();
    if (!assetId) {
      assetId = state.geojson.features[0]?.properties?.asset_id || "";
    }
    const feature = state.geojson.features.find((item) => item?.properties?.asset_id === assetId);
    if (!feature) {
      res.status(404).json({ error: `Asset not found: ${assetId}` });
      return;
    }

    const prev = Number(feature.properties.risk_score || 0);
    const severity = Number(req.body?.severity || 3);
    const delta = clamp(0.01 * severity, 0.01, 0.06);
    const next = clamp(prev + delta);
    const safetyBand = safetyBandForScore(next);

    feature.properties.risk_score = Number(next.toFixed(4));
    feature.properties.safety_band = safetyBand;
    feature.properties.urgency = urgencyForBand(safetyBand);
    feature.properties.last_updated = new Date().toISOString();

    state.reportsByAsset[assetId] = state.reportsByAsset[assetId] || [];
    state.reportsByAsset[assetId].push({
      report_id: `RPT-${Math.random().toString(16).slice(2, 10)}`,
      created_at: new Date().toISOString(),
      report_type: "manual_update",
      description,
      severity,
      source: String(req.body?.source || "manual"),
      image_url: req.body?.image_url || "",
    });

    res.json({
      ok: true,
      updated_asset: {
        asset_id: assetId,
        risk_score: feature.properties.risk_score,
        safety_band: feature.properties.safety_band,
        urgency: feature.properties.urgency,
        risk_factors: feature.properties.risk_factors,
        risk_delta_24h: Number((next - prev).toFixed(4)),
      },
      meta: { fallback: true },
    });
  }
});

app.post("/api/reports/ingest-batch", async (req, res) => {
  try {
    const payload = await proxyMl("/reports/ingest-batch", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      res.status(400).json({ error: "Provide rows for offline fallback batch ingest" });
      return;
    }
    const state = await getFallbackState();
    const deltas = [];
    for (const row of rows) {
      const assetId = String(row?.asset_id || "").trim();
      const feature = state.geojson.features.find((item) => item?.properties?.asset_id === assetId);
      if (!feature) continue;
      const prev = Number(feature.properties.risk_score || 0);
      const severity = Number(row?.severity || 3);
      const delta = clamp(0.01 * severity, 0.01, 0.06);
      const next = clamp(prev + delta);
      feature.properties.risk_score = Number(next.toFixed(4));
      const safetyBand = safetyBandForScore(next);
      feature.properties.safety_band = safetyBand;
      feature.properties.urgency = urgencyForBand(safetyBand);
      feature.properties.last_updated = new Date().toISOString();
      deltas.push({
        asset_id: assetId,
        risk_score: feature.properties.risk_score,
        safety_band: feature.properties.safety_band,
        urgency: feature.properties.urgency,
        risk_delta_24h: Number((next - prev).toFixed(4)),
      });
    }
    deltas.sort((a, b) => Math.abs(b.risk_delta_24h) - Math.abs(a.risk_delta_24h));
    res.json({
      ok: true,
      ingested_count: rows.length,
      impacted_assets_count: deltas.length,
      top_changed_assets: deltas.slice(0, 20),
      meta: { fallback: true },
    });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const payload = await proxyMl("/feedback", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch {
    res.json({ ok: true, asset_id: req.body?.asset_id || null, meta: { fallback: true } });
  }
});

app.get("/api/examples", async (_req, res) => {
  try {
    const map = await proxyMl("/map/assets?type=all");
    const features = Array.isArray(map?.features) ? map.features : [];
    const top = [...features]
      .sort((a, b) => (b?.properties?.risk_score || 0) - (a?.properties?.risk_score || 0))
      .slice(0, 5)
      .map((item) => item?.properties?.asset_id)
      .filter(Boolean);

    res.json({
      asset_ids: top,
      voice_notes: [
        "Observed recurring pothole rebound after previous patch on northbound lane shoulder.",
        "Bridge deck shows corrosion staining and fresh spalling near expansion joint.",
        "Drainage inlet blocked and edge washout worsening after rainfall.",
      ],
    });
  } catch {
    const state = await getFallbackState();
    const top = [...state.geojson.features]
      .sort((a, b) => (b?.properties?.risk_score || 0) - (a?.properties?.risk_score || 0))
      .slice(0, 5)
      .map((item) => item?.properties?.asset_id)
      .filter(Boolean);
    res.json({
      asset_ids: top,
      voice_notes: [
        "Worker log: repeated pothole rebound after freeze-thaw and heavy truck traffic.",
        "Construction update: corrosion staining and fresh spalling near expansion joint.",
        "Inspection note: drainage inlet blocked; edge washout worsening after rainfall.",
      ],
      meta: { fallback: true },
    });
  }
});

export default app;
