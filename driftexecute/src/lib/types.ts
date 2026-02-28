export const paceOptions = ["slow", "moderate", "fast"] as const;
export const interestOptions = [
  "food",
  "museums",
  "nightlife",
  "hiking",
  "beach",
  "shopping",
  "nature",
] as const;
export const constraintOptions = [
  "no_red_eye",
  "vegetarian",
  "halal",
  "no_rushing",
  "accessibility",
] as const;

export type Pace = (typeof paceOptions)[number];
export type Interest = (typeof interestOptions)[number];
export type Constraint = (typeof constraintOptions)[number];

export interface Preference {
  budgetMin: number;
  budgetMax: number;
  tripLengthPreferredDays: number;
  pace: Pace;
  interests: Interest[];
  constraints: Constraint[];
  updatedAt: string;
}

export interface PreferenceInput {
  budgetMin: number;
  budgetMax: number;
  tripLengthPreferredDays: number;
  pace: Pace;
  interests: Interest[];
  constraints: Constraint[];
}

export interface Trip {
  id: string;
  title: string;
  destinations: string[];
  photoDataUrl?: string;
  startDate?: string;
  endDate?: string;
  totalCost: number;
  rating: number;
  tags: string[];
  highlights: string;
  painPoints: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripInput {
  title: string;
  destinations: string[];
  photoDataUrl?: string;
  startDate?: string;
  endDate?: string;
  totalCost: number;
  rating: number;
  tags: string[];
  highlights: string;
  painPoints: string;
  notes: string;
}

export type UpdateTripInput = Partial<CreateTripInput>;

export interface Recommendation {
  id: string;
  destination: string;
  suggestedLengthDays: number;
  estimatedCostRange: string;
  rationale: string;
  score: number;
}

export interface SimilarTripResult {
  trip: Trip;
  score: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatCitation {
  tripId: string;
  tripTitle: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  citations?: ChatCitation[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
  similarTrips: SimilarTripResult[];
}

export type ExecutionStrategy = "shorten+send" | "microstep+timer" | "choose-top-3";

export interface StrategyStat {
  success: number;
  failure: number;
}

export interface UserProfile {
  userId: string;
  summary?: string;
  strategyStats: Record<string, StrategyStat>;
}

export interface InteractionEvent {
  id: string;
  userId: string;
  taskText: string;
  taskCategory: string;
  suggestedStrategy: ExecutionStrategy;
  executed: boolean | null;
  explanation?: string;
  microSteps?: string[];
  actionPayload?: Record<string, unknown> | null;
  timestamp: string;
  updatedAt?: string;
}

export interface ExecuteTaskInput {
  userId: string;
  taskText: string;
  taskCategory?: string;
}

export interface ExecuteTaskResponse {
  eventId: string;
  explanation: string;
  microSteps: string[];
  recommendedStrategy: ExecutionStrategy;
  actionPayload: Record<string, unknown> | null;
}

export interface SubmitFeedbackInput {
  userId: string;
  eventId: string;
  executed: boolean;
  suggestedStrategy?: ExecutionStrategy;
}

export interface SubmitFeedbackResponse {
  eventId: string;
  executed: boolean;
  suggestedStrategy: ExecutionStrategy;
  strategyStats: Record<string, StrategyStat>;
}

export interface ExecutionProfileResponse {
  profile: UserProfile;
  recentEvents: InteractionEvent[];
}

export type InfraAssetType = "road" | "bridge";

export interface InfraAssetFeatureProperties {
  asset_id: string;
  asset_type: InfraAssetType;
  name: string;
  risk_score: number;
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
  source: "voice" | "manual";
  description: string;
  severity?: number;
  lat?: number;
  lon?: number;
  image_url?: string;
}

export interface InfraFeedbackInput {
  asset_id: string;
  helpful: boolean;
  reason?: string;
  chosen_action?: string;
}

export interface AppStorageV1 {
  version: 1;
  preferences: Preference | null;
  trips: Trip[];
  chatSessions: ChatSession[];
}


