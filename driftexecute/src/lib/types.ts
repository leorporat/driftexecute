export type InfraAssetType = "road" | "bridge";
export type InfraSafetyBand = "low" | "guarded" | "elevated" | "critical";
export type InfraUrgency = "monitor" | "schedule_30d" | "schedule_7d" | "immediate_48h";

export interface InfraAssetFeatureProperties {
  asset_id: string;
  asset_type: InfraAssetType;
  name: string;
  risk_score: number;
  safety_band: InfraSafetyBand;
  urgency: InfraUrgency;
  risk_factors: string[];
  inconsistency_score: number;
  activity_score: number;
  top_reason: string;
  tags: string[];
  last_updated: string;
}

export interface InfraAssetFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: InfraAssetFeatureProperties;
}

export interface InfraGeoJson {
  type: "FeatureCollection";
  features: InfraAssetFeature[];
}

export interface InfraReport {
  report_id: string;
  created_at: string;
  report_type: string;
  description: string;
  severity: number;
  source: string;
  lat?: number | null;
  lon?: number | null;
  image_url?: string;
  image_tags?: string[];
  cluster_id?: number;
  similarity?: number;
}

export interface InfraSimilarAsset {
  asset_id: string;
  name: string;
  asset_type: InfraAssetType;
  similarity: number;
  risk_score: number;
}

export interface InfraAssetDetailsResponse {
  asset: Record<string, unknown> & {
    asset_id: string;
    asset_type: InfraAssetType;
    name: string;
    lat: number;
    lon: number;
    risk_score: number;
    safety_band: InfraSafetyBand;
    urgency: InfraUrgency;
    risk_factors: string[];
    activity_score: number;
    inconsistency_score: number;
    confidence: number;
    top_reason: string;
    tags: string[];
  };
  last_reports: InfraReport[];
  similar_assets: InfraSimilarAsset[];
  similar_incidents: InfraReport[];
  risk_score: number;
  safety_band: InfraSafetyBand;
  urgency: InfraUrgency;
  risk_factors: string[];
  inconsistency_score: number;
  confidence: number;
  cause_hypotheses: string[];
  recommended_actions: string[];
}

export interface InfraClusterItem {
  cluster_id: number;
  count_30d: number;
  count_7d: number;
  affected_assets: number;
  top_terms: string[];
  cause_hypothesis: string;
  center_lat?: number | null;
  center_lon?: number | null;
}

export interface InfraRecommendResponse<T = unknown> {
  results: T;
  summary: Record<string, unknown>;
  debug?: Record<string, unknown>;
}

export interface InfraIngestInput {
  asset_id?: string;
  source: "worker_log" | "construction_update" | "inspection" | "manual" | "voice";
  description: string;
  severity?: number;
  lat?: number;
  lon?: number;
  image_url?: string;
  created_at?: string;
}

export interface InfraBatchIngestInput {
  rows?: InfraIngestInput[];
  csv_text?: string;
}

export interface InfraFeedbackInput {
  asset_id: string;
  helpful: boolean;
  reason?: string;
  chosen_action?: string;
}
