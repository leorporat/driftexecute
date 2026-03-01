import type {
  InfraAssetDetailsResponse,
  InfraBatchIngestInput,
  InfraClusterItem,
  InfraFeedbackInput,
  InfraGeoJson,
  InfraIngestInput,
  InfraRecommendResponse,
} from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
const INFRA_FALLBACK_GEOJSON = "/infra/fallback-assets.geojson";
const INFRA_UX_KEY = "infrapulse_ux_v1";
let cachedAssets: InfraGeoJson | null = null;

function safetyBandForScore(score: number): "low" | "guarded" | "elevated" | "critical" {
  if (score < 0.3) return "low";
  if (score < 0.55) return "guarded";
  if (score < 0.75) return "elevated";
  return "critical";
}

function urgencyForBand(band: "low" | "guarded" | "elevated" | "critical"): "monitor" | "schedule_30d" | "schedule_7d" | "immediate_48h" {
  if (band === "low") return "monitor";
  if (band === "guarded") return "schedule_30d";
  if (band === "elevated") return "schedule_7d";
  return "immediate_48h";
}

function normalizeGeoJson(payload: InfraGeoJson): InfraGeoJson {
  return {
    ...payload,
    features: payload.features.map((feature) => {
      const riskScore = Number(feature.properties.risk_score || 0);
      const inferredBand = safetyBandForScore(riskScore);
      const band = feature.properties.safety_band || inferredBand;
      const urgency = feature.properties.urgency || urgencyForBand(band);
      const factors = Array.isArray(feature.properties.risk_factors)
        ? feature.properties.risk_factors
        : [feature.properties.top_reason || "condition deterioration"];
      return {
        ...feature,
        properties: {
          ...feature.properties,
          safety_band: band,
          urgency,
          risk_factors: factors,
        },
      };
    }),
  };
}

async function fetchBackend<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network request failed";
    throw new Error(`Backend unavailable (${message}). Start backend on ${API_BASE_URL}.`);
  }

  if (!response.ok) {
    let message = `Backend request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

interface InfraUxState {
  lastSelectedAssetId: string | null;
  recentSearches: string[];
  feedbackByAsset: Record<string, "up" | "down">;
}

function loadInfraUxState(): InfraUxState {
  if (typeof window === "undefined") {
    return {
      lastSelectedAssetId: null,
      recentSearches: [],
      feedbackByAsset: {},
    };
  }
  try {
    const raw = localStorage.getItem(INFRA_UX_KEY);
    if (!raw) {
      throw new Error("missing");
    }
    const parsed = JSON.parse(raw) as Partial<InfraUxState>;
    return {
      lastSelectedAssetId: parsed.lastSelectedAssetId || null,
      recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches.slice(0, 12) : [],
      feedbackByAsset: parsed.feedbackByAsset || {},
    };
  } catch {
    return {
      lastSelectedAssetId: null,
      recentSearches: [],
      feedbackByAsset: {},
    };
  }
}

function saveInfraUxState(state: InfraUxState): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(INFRA_UX_KEY, JSON.stringify(state));
}

async function fetchFallbackInfraGeoJson(): Promise<InfraGeoJson> {
  const response = await fetch(INFRA_FALLBACK_GEOJSON);
  if (!response.ok) {
    throw new Error("Fallback GeoJSON is unavailable.");
  }
  return response.json() as Promise<InfraGeoJson>;
}

function buildFallbackAssetDetails(assetId: string): InfraAssetDetailsResponse {
  const feature = (cachedAssets?.features || []).find((item) => item.properties.asset_id === assetId);
  if (!feature) {
    throw new Error("Asset details unavailable offline for this asset.");
  }
  const props = feature.properties;
  const lat = feature.geometry.coordinates[1];
  const lon = feature.geometry.coordinates[0];
  const now = new Date().toISOString();
  const topReason = props.top_reason || "condition deterioration";
  const recommended =
    topReason.includes("drain")
      ? [
          "Deploy drainage crew and inspect outfalls within 48 hours.",
          "Clear inlets and regrade shoulder runoff channels.",
        ]
      : topReason.includes("inconsistency")
        ? [
            "Schedule targeted field inspection within 7 days.",
            "Review conflicting condition and incident signals with district engineer.",
          ]
        : [
            "Schedule targeted field inspection within 7 days.",
            "Bundle nearby work orders to reduce repeat patch cycles.",
          ];

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
      tags: props.tags,
    },
    last_reports: [],
    similar_assets: [],
    similar_incidents: [],
    risk_score: props.risk_score,
    safety_band: props.safety_band,
    urgency: props.urgency,
    risk_factors: props.risk_factors,
    inconsistency_score: props.inconsistency_score,
    confidence: 0.5,
    cause_hypotheses: [
      "Running in offline fallback mode. Start backend and ML API for full incident and similarity detail.",
      `Primary signal detected: ${topReason}.`,
    ],
    recommended_actions: recommended,
  };
}

export async function getInfraMapAssets(type: "all" | "road" | "bridge" = "all"): Promise<InfraGeoJson> {
  try {
    const payload = normalizeGeoJson(
      await fetchBackend<InfraGeoJson>(`/api/map/assets?type=${encodeURIComponent(type)}`),
    );
    cachedAssets = payload;
    return payload;
  } catch (error) {
    console.warn("Infra map API unavailable, using baked-in fallback sample.", error);
    const fallback = normalizeGeoJson(await fetchFallbackInfraGeoJson());
    cachedAssets = fallback;
    return fallback;
  }
}

export async function getInfraAssetDetails(assetId: string): Promise<InfraAssetDetailsResponse> {
  try {
    return await fetchBackend<InfraAssetDetailsResponse>(`/api/asset/${encodeURIComponent(assetId)}`);
  } catch (error) {
<<<<<<< HEAD
    console.warn("Infra details API unavailable, using offline fallback details.", error);
    if (!cachedAssets) {
      cachedAssets = await fetchFallbackInfraGeoJson();
    }
    return buildFallbackAssetDetails(assetId);
=======
    const fallback = await fetchFallbackInfraGeoJson().catch(() => null);
    const feature = fallback?.features?.find((item) => item.properties.asset_id === assetId);
    if (!feature) {
      throw error;
    }
    return {
      asset: {
        asset_id: feature.properties.asset_id,
        asset_type: feature.properties.asset_type,
        name: feature.properties.name,
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        risk_score: feature.properties.risk_score,
        activity_score: feature.properties.activity_score,
        inconsistency_score: feature.properties.inconsistency_score,
        confidence: 0.35,
        top_reason: feature.properties.top_reason,
        tags: feature.properties.tags,
      },
      last_reports: [],
      similar_assets: [],
      similar_incidents: [],
      risk_score: feature.properties.risk_score,
      inconsistency_score: feature.properties.inconsistency_score,
      confidence: 0.35,
      cause_hypotheses: [
        "Backend/ML API unavailable. Showing fallback asset sample only.",
      ],
      recommended_actions: [
        "Start backend (:3001) and ML API (:8001) to load live asset intelligence.",
      ],
    };
>>>>>>> syed
  }
}

export async function getInfraActivityFeed(): Promise<InfraClusterItem[]> {
  const response = await fetchBackend<InfraRecommendResponse<InfraClusterItem[]>>("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ type: "reportCluster" }),
  });
  return Array.isArray(response.results) ? response.results : [];
}

export async function getInfraHotspots(input: {
  lat?: number;
  lon?: number;
  radius_km?: number;
}): Promise<Record<string, unknown>[]> {
  const response = await fetchBackend<InfraRecommendResponse<Record<string, unknown>[]>>("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ type: "areaHotspot", ...input }),
  });
  return Array.isArray(response.results) ? response.results : [];
}

export async function ingestInfraReport(input: InfraIngestInput): Promise<Record<string, unknown>> {
  return fetchBackend<Record<string, unknown>>("/api/reports/ingest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function ingestInfraBatch(input: InfraBatchIngestInput): Promise<Record<string, unknown>> {
  return fetchBackend<Record<string, unknown>>("/api/reports/ingest-batch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitInfraFeedback(input: InfraFeedbackInput): Promise<Record<string, unknown>> {
  const result = await fetchBackend<Record<string, unknown>>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const current = loadInfraUxState();
  current.feedbackByAsset[input.asset_id] = input.helpful ? "up" : "down";
  saveInfraUxState(current);
  return result;
}

export async function getInfraExamples(): Promise<{ asset_ids: string[]; voice_notes: string[] }> {
  return fetchBackend<{ asset_ids: string[]; voice_notes: string[] }>("/api/examples");
}

export function getLastSelectedAssetId(): string | null {
  return loadInfraUxState().lastSelectedAssetId;
}

export function setLastSelectedAssetId(assetId: string | null): void {
  const current = loadInfraUxState();
  current.lastSelectedAssetId = assetId;
  saveInfraUxState(current);
}

export function pushInfraRecentSearch(value: string): void {
  const text = value.trim();
  if (!text) {
    return;
  }
  const current = loadInfraUxState();
  current.recentSearches = [text, ...current.recentSearches.filter((item) => item !== text)].slice(0, 12);
  saveInfraUxState(current);
}

export function getInfraRecentSearches(): string[] {
  return loadInfraUxState().recentSearches;
}

export function getInfraFeedbackByAsset(): Record<string, "up" | "down"> {
  return loadInfraUxState().feedbackByAsset;
}

export const apiClient = {
  getInfraMapAssets,
  getInfraAssetDetails,
  getInfraActivityFeed,
  getInfraHotspots,
  ingestInfraReport,
  ingestInfraBatch,
  submitInfraFeedback,
  getInfraExamples,
  getLastSelectedAssetId,
  setLastSelectedAssetId,
  pushInfraRecentSearch,
  getInfraRecentSearches,
  getInfraFeedbackByAsset,
};
