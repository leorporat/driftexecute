import { rankTripsBySimilarity, tokenize, tripToDocument } from "@/lib/similarity";
import { loadStorage, updateStorage } from "@/lib/storage";
import type {
  ChatMessage,
  ChatResponse,
  ChatSession,
  Constraint,
  CreateTripInput,
  ExecutionProfileResponse,
  InfraAssetDetailsResponse,
  InfraClusterItem,
  InfraFeedbackInput,
  InfraGeoJson,
  InfraIngestInput,
  InfraRecommendResponse,
  ExecuteTaskInput,
  ExecuteTaskResponse,
  Interest,
  Pace,
  Preference,
  PreferenceInput,
  Recommendation,
  SimilarTripResult,
  SubmitFeedbackInput,
  SubmitFeedbackResponse,
  Trip,
  UpdateTripInput,
} from "@/lib/types";

interface DestinationProfile {
  name: string;
  baseLengthDays: number;
  avgDailyCost: number;
  interests: Interest[];
  pace: Pace;
  constraintFriendly: Constraint[];
}

interface MlRecommendationResponse {
  recommended_destinations: string[];
  neighbors: Record<string, unknown>[];
}

const destinationCatalog: DestinationProfile[] = [
  {
    name: "Lisbon",
    baseLengthDays: 5,
    avgDailyCost: 165,
    interests: ["food", "museums", "nightlife", "beach"],
    pace: "moderate",
    constraintFriendly: ["vegetarian", "no_rushing"],
  },
  {
    name: "Barcelona",
    baseLengthDays: 6,
    avgDailyCost: 195,
    interests: ["food", "museums", "beach", "nightlife", "shopping"],
    pace: "fast",
    constraintFriendly: ["vegetarian", "no_rushing"],
  },
  {
    name: "Tokyo",
    baseLengthDays: 7,
    avgDailyCost: 240,
    interests: ["food", "museums", "shopping", "nature"],
    pace: "fast",
    constraintFriendly: ["halal", "vegetarian", "accessibility"],
  },
  {
    name: "Mexico City",
    baseLengthDays: 5,
    avgDailyCost: 140,
    interests: ["food", "museums", "nightlife", "shopping"],
    pace: "moderate",
    constraintFriendly: ["vegetarian", "no_red_eye"],
  },
  {
    name: "Chicago",
    baseLengthDays: 4,
    avgDailyCost: 220,
    interests: ["food", "museums", "nightlife", "shopping"],
    pace: "fast",
    constraintFriendly: ["accessibility", "vegetarian"],
  },
  {
    name: "Vancouver",
    baseLengthDays: 5,
    avgDailyCost: 210,
    interests: ["nature", "hiking", "food"],
    pace: "slow",
    constraintFriendly: ["no_rushing", "accessibility", "vegetarian"],
  },
  {
    name: "Istanbul",
    baseLengthDays: 6,
    avgDailyCost: 150,
    interests: ["food", "museums", "shopping", "nightlife"],
    pace: "moderate",
    constraintFriendly: ["halal", "vegetarian"],
  },
  {
    name: "Dubai",
    baseLengthDays: 5,
    avgDailyCost: 280,
    interests: ["shopping", "nightlife", "beach", "food"],
    pace: "fast",
    constraintFriendly: ["halal", "accessibility"],
  },
  {
    name: "Bangkok",
    baseLengthDays: 6,
    avgDailyCost: 120,
    interests: ["food", "nightlife", "shopping", "museums"],
    pace: "fast",
    constraintFriendly: ["halal", "vegetarian"],
  },
  {
    name: "Rome",
    baseLengthDays: 5,
    avgDailyCost: 205,
    interests: ["food", "museums", "shopping"],
    pace: "moderate",
    constraintFriendly: ["vegetarian", "no_rushing"],
  },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
const ML_API_BASE_URL = process.env.NEXT_PUBLIC_ML_API_BASE_URL || "http://127.0.0.1:8001";
const INFRA_FALLBACK_GEOJSON = "/infra/fallback-assets.geojson";
const INFRA_UX_KEY = "infrapulse_ux_v1";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

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

async function fetchMlRecommendations(
  payload: Record<string, unknown>,
): Promise<MlRecommendationResponse> {
  const response = await fetch(`${ML_API_BASE_URL}/recommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `ML recommendation request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<MlRecommendationResponse>;
}

function toUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getReferenceTrip(trips: Trip[]): Trip | null {
  if (trips.length === 0) {
    return null;
  }
  return [...trips].sort((a, b) => b.rating - a.rating)[0];
}

function estimateRange(center: number): string {
  const min = Math.max(50, Math.round(center * 0.85));
  const max = Math.round(center * 1.15);
  return `${toUsd(min)} - ${toUsd(max)}`;
}

function getStartMonth(trip: Trip | null): number | null {
  if (!trip?.startDate) {
    return null;
  }
  const parsed = new Date(trip.startDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getMonth() + 1;
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[^\d.-]/g, "").trim();
  if (cleaned.length === 0) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferAccommodationType(trip: Trip | null): string {
  const text = trip ? `${trip.title} ${trip.tags.join(" ")} ${trip.notes}`.toLowerCase() : "";
  if (text.includes("hostel")) {
    return "Hostel";
  }
  if (text.includes("airbnb") || text.includes("apartment")) {
    return "Apartment";
  }
  if (text.includes("resort")) {
    return "Resort";
  }
  return "Hotel";
}

function inferTransportationType(trip: Trip | null): string {
  const text = trip
    ? `${trip.title} ${trip.tags.join(" ")} ${trip.highlights} ${trip.notes}`.toLowerCase()
    : "";
  if (text.includes("train")) {
    return "Train";
  }
  if (text.includes("road") || text.includes("car") || text.includes("drive")) {
    return "Car";
  }
  if (text.includes("bus")) {
    return "Bus";
  }
  return "Flight";
}

function buildMlPayload(prefs: Preference, trips: Trip[]): Record<string, unknown> {
  const referenceTrip = getReferenceTrip(trips) ?? trips[0] ?? null;
  const preferredDays = Math.max(2, prefs.tripLengthPreferredDays || 5);
  const budgetCenter = Math.max(0, Math.round((prefs.budgetMin + prefs.budgetMax) / 2));
  const tripCost = Math.max(0, Math.round(referenceTrip?.totalCost || budgetCenter));
  const accommodationCost = Math.round(tripCost * 0.65);
  const transportationCost = Math.max(0, tripCost - accommodationCost);
  const startMonth = getStartMonth(referenceTrip);

  return {
    "Duration (days)": preferredDays,
    "Traveler age": null,
    "Traveler gender": "Unknown",
    "Traveler nationality": "Unknown",
    "Accommodation type": inferAccommodationType(referenceTrip),
    "Accommodation cost": accommodationCost,
    "Transportation type": inferTransportationType(referenceTrip),
    "Transportation cost": transportationCost,
    ...(startMonth ? { start_month: startMonth } : {}),
  };
}

function mapMlRecommendations(
  response: MlRecommendationResponse,
  prefs: Preference,
  trips: Trip[],
): Recommendation[] {
  const preferredDays = Math.max(2, prefs.tripLengthPreferredDays || 5);
  const budgetCenter = Math.max(200, Math.round((prefs.budgetMin + prefs.budgetMax) / 2));
  const neighbors = Array.isArray(response.neighbors) ? response.neighbors : [];

  return response.recommended_destinations.slice(0, 3).map((destination, index) => {
    const destinationNeighbors = neighbors.filter((neighbor) => {
      const value =
        neighbor["Destination"] ??
        neighbor["Travel destination"] ??
        neighbor["City"] ??
        neighbor["Place"];
      return typeof value === "string" && value.toLowerCase() === destination.toLowerCase();
    });

    const strongestSimilarity = destinationNeighbors
      .map((neighbor) => parseLooseNumber(neighbor.similarity))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0];

    const estimatedCosts = destinationNeighbors
      .map((neighbor) => {
        const lodging = parseLooseNumber(neighbor["Accommodation cost"]);
        const transit = parseLooseNumber(neighbor["Transportation cost"]);
        if (lodging === null && transit === null) {
          return null;
        }
        return (lodging ?? 0) + (transit ?? 0);
      })
      .filter((value): value is number => value !== null && value > 0);

    const estimatedCenter =
      estimatedCosts.length > 0
        ? estimatedCosts.reduce((sum, value) => sum + value, 0) / estimatedCosts.length
        : budgetCenter;

    const referenceTrip = getReferenceTrip(trips) ?? trips[0] ?? null;
    const rationale = referenceTrip
      ? `Model matched ${destination} against trips similar to ${referenceTrip.title} (${referenceTrip.rating}/10).`
      : `Model matched ${destination} based on your saved profile.`;

    return {
      id: createId("rec"),
      destination,
      suggestedLengthDays: preferredDays,
      estimatedCostRange: estimateRange(estimatedCenter),
      rationale,
      score: Number((strongestSimilarity ?? Math.max(0.25, 0.9 - index * 0.12)).toFixed(2)),
    };
  });
}

function scoreDestination(
  destination: DestinationProfile,
  prefs: Preference,
  trips: Trip[],
): Recommendation {
  const preferredDays = Math.max(2, prefs.tripLengthPreferredDays || destination.baseLengthDays);
  const interestOverlap = destination.interests.filter((item) => prefs.interests.includes(item));
  const constraintOverlap = prefs.constraints.filter((item) =>
    destination.constraintFriendly.includes(item),
  );

  let score = 0;
  score += interestOverlap.length * 3;
  score += destination.pace === prefs.pace ? 2 : 0;
  score += constraintOverlap.length * 1.5;

  const estimatedTripCost = destination.avgDailyCost * preferredDays;
  if (estimatedTripCost >= prefs.budgetMin && estimatedTripCost <= prefs.budgetMax) {
    score += 5;
  } else {
    const distance =
      estimatedTripCost < prefs.budgetMin
        ? prefs.budgetMin - estimatedTripCost
        : estimatedTripCost - prefs.budgetMax;
    score += Math.max(0, 5 - distance / 350);
  }

  const referenceTrip = getReferenceTrip(trips);
  const referenceSignals = referenceTrip
    ? tokenize(tripToDocument(referenceTrip)).filter((token) =>
        destination.interests.some((interest) => token.includes(interest)),
      )
    : [];
  score += Math.min(3, referenceSignals.length * 0.5);

  const rationaleTrip = referenceTrip ?? trips[0];
  const citedInterests =
    interestOverlap.length > 0 ? interestOverlap.join(" + ") : prefs.interests.slice(0, 2).join(" + ");
  const rationale = rationaleTrip
    ? `Because you rated ${rationaleTrip.title} ${rationaleTrip.rating}/10 and liked ${citedInterests}, ${destination.name} fits your ${prefs.pace} pace and budget range (${toUsd(prefs.budgetMin)}-${toUsd(prefs.budgetMax)}).`
    : `${destination.name} aligns with your saved interests, budget, and pace preferences.`;

  return {
    id: createId("rec"),
    destination: destination.name,
    suggestedLengthDays: preferredDays,
    estimatedCostRange: estimateRange(estimatedTripCost),
    rationale,
    score: Number(score.toFixed(2)),
  };
}

export async function getPreferences(): Promise<Preference | null> {
  return loadStorage().preferences;
}

export async function savePreferences(input: PreferenceInput): Promise<Preference> {
  const payload: Preference = {
    ...input,
    updatedAt: nowIso(),
  };
  updateStorage((current) => ({
    ...current,
    preferences: payload,
  }));
  return payload;
}

export async function listTrips(): Promise<Trip[]> {
  return [...loadStorage().trips].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const now = nowIso();
  const next: Trip = {
    ...input,
    id: createId("trip"),
    createdAt: now,
    updatedAt: now,
  };
  updateStorage((current) => ({
    ...current,
    trips: [next, ...current.trips],
  }));
  return next;
}

export async function updateTrip(tripId: string, input: UpdateTripInput): Promise<Trip | null> {
  let updatedTrip: Trip | null = null;
  updateStorage((current) => ({
    ...current,
    trips: current.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }
      updatedTrip = {
        ...trip,
        ...input,
        updatedAt: nowIso(),
      };
      return updatedTrip;
    }),
  }));
  return updatedTrip;
}

export async function deleteTrip(tripId: string): Promise<void> {
  updateStorage((current) => ({
    ...current,
    trips: current.trips.filter((trip) => trip.id !== tripId),
  }));
}

export async function querySimilarTrips(
  queryText: string,
  topK = 3,
): Promise<SimilarTripResult[]> {
  return rankTripsBySimilarity(loadStorage().trips, queryText, topK);
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const prefs = await getPreferences();
  const trips = await listTrips();
  if (!prefs || trips.length === 0) {
    return [];
  }

  try {
    const payload = buildMlPayload(prefs, trips);
    const mlResponse = await fetchMlRecommendations(payload);
    const mapped = mapMlRecommendations(mlResponse, prefs, trips);
    if (mapped.length > 0) {
      return mapped;
    }
  } catch (error) {
    console.warn("ML recommendations unavailable, falling back to local scorer.", error);
  }

  return destinationCatalog
    .map((destination) => scoreDestination(destination, prefs, trips))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export async function chat(messages: ChatMessage[]): Promise<ChatResponse> {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  const queryText = userMessage?.content ?? "";
  const similarTrips = await querySimilarTrips(queryText, 3);
  const prefs = await getPreferences();
  const recs = await getRecommendations();

  const bestScore = similarTrips[0]?.score ?? 0;
  const lowSimilarity = bestScore < 0.12;
  const cited = similarTrips.filter((item) => item.score > 0).slice(0, 3);

  const profileLine = prefs
    ? `Your profile: ${prefs.pace} pace, ${prefs.tripLengthPreferredDays} day trips, budget ${toUsd(prefs.budgetMin)}-${toUsd(prefs.budgetMax)}.`
    : "I do not have preferences yet, so I am using only your past trip text.";

  const retrievalLine =
    cited.length > 0
      ? `Closest matching trips are ${cited
          .map((item) => `${item.trip.title} (${Math.round(item.score * 100)}% match)`)
          .join(", ")}.`
      : "I did not find a strong trip match in your saved history.";

  const recommendationLine =
    recs[0] !== undefined
      ? `A strong next option is ${recs[0].destination} for about ${recs[0].suggestedLengthDays} days (${recs[0].estimatedCostRange}).`
      : "Add at least one trip and save preferences to unlock stronger destination recommendations.";

  const questions: string[] = [];
  if (lowSimilarity) {
    questions.push("Which city or region are you currently considering?");
  }
  if (!prefs || prefs.budgetMax <= 0) {
    questions.push("What budget range should I optimize for?");
  }
  if (!prefs || prefs.tripLengthPreferredDays <= 0) {
    questions.push("How many days do you want this trip to be?");
  }

  const usedLine =
    cited.length > 0
      ? cited
          .map(
            (item) =>
              `- ${item.trip.title} (${item.trip.destinations.join(", ")}) score=${item.score.toFixed(2)}`,
          )
          .join("\n")
      : "- none";

  const followUp =
    questions.length > 0 ? `\n\nTo narrow this down:\n${questions.map((q) => `- ${q}`).join("\n")}` : "";

  const content = `${profileLine}\n\n${retrievalLine}\n${recommendationLine}${followUp}\n\nUsed:\n${usedLine}`;

  const assistantMessage: ChatMessage = {
    id: createId("msg"),
    role: "assistant",
    content,
    createdAt: nowIso(),
    citations: cited.map((item) => ({
      tripId: item.trip.id,
      tripTitle: item.trip.title,
      score: item.score,
    })),
  };

  return {
    message: assistantMessage,
    similarTrips,
  };
}

export async function listChatSessions(): Promise<ChatSession[]> {
  return [...loadStorage().chatSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  return loadStorage().chatSessions.find((session) => session.id === sessionId) ?? null;
}

export async function createChatSession(title?: string): Promise<ChatSession> {
  const now = nowIso();
  const session: ChatSession = {
    id: createId("chat"),
    title: title?.trim() || `Chat ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: createId("msg"),
        role: "assistant",
        content:
          "Share what you want to plan and I will pull from your similar past trips.\n\nUsed:\n- none",
        createdAt: now,
      },
    ],
  };

  updateStorage((current) => ({
    ...current,
    chatSessions: [session, ...current.chatSessions],
  }));
  return session;
}

export async function upsertChatSession(session: ChatSession): Promise<ChatSession> {
  const now = nowIso();
  const nextSession: ChatSession = {
    ...session,
    updatedAt: now,
  };
  updateStorage((current) => {
    const rest = current.chatSessions.filter((item) => item.id !== nextSession.id);
    return {
      ...current,
      chatSessions: [nextSession, ...rest],
    };
  });
  return nextSession;
}

export async function appendChatMessage(
  sessionId: string,
  message: ChatMessage,
): Promise<ChatSession | null> {
  const existing = await getChatSession(sessionId);
  if (!existing) {
    return null;
  }
  const title =
    existing.title.startsWith("Chat ") && message.role === "user"
      ? message.content.slice(0, 38) || existing.title
      : existing.title;
  return upsertChatSession({
    ...existing,
    title,
    messages: [...existing.messages, message],
  });
}

export async function executeTask(input: ExecuteTaskInput): Promise<ExecuteTaskResponse> {
  return fetchBackend<ExecuteTaskResponse>("/execute", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResponse> {
  return fetchBackend<SubmitFeedbackResponse>("/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getExecutionProfile(userId: string): Promise<ExecutionProfileResponse> {
  return fetchBackend<ExecutionProfileResponse>(`/profile/${encodeURIComponent(userId)}`);
}

async function fetchFallbackInfraGeoJson(): Promise<InfraGeoJson> {
  const response = await fetch(INFRA_FALLBACK_GEOJSON);
  if (!response.ok) {
    throw new Error("Fallback GeoJSON is unavailable.");
  }
  return response.json() as Promise<InfraGeoJson>;
}

export async function getInfraMapAssets(type: "all" | "road" | "bridge" = "all"): Promise<InfraGeoJson> {
  try {
    return await fetchBackend<InfraGeoJson>(`/api/map/assets?type=${encodeURIComponent(type)}`);
  } catch (error) {
    console.warn("Infra map API unavailable, using baked-in fallback sample.", error);
    return fetchFallbackInfraGeoJson();
  }
}

export async function getInfraAssetDetails(assetId: string): Promise<InfraAssetDetailsResponse> {
  try {
    return await fetchBackend<InfraAssetDetailsResponse>(`/api/asset/${encodeURIComponent(assetId)}`);
  } catch (error) {
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
  getPreferences,
  savePreferences,
  listTrips,
  createTrip,
  updateTrip,
  deleteTrip,
  querySimilarTrips,
  chat,
  getRecommendations,
  listChatSessions,
  getChatSession,
  createChatSession,
  upsertChatSession,
  appendChatMessage,
  executeTask,
  submitFeedback,
  getExecutionProfile,
  getInfraMapAssets,
  getInfraAssetDetails,
  getInfraActivityFeed,
  getInfraHotspots,
  ingestInfraReport,
  submitInfraFeedback,
  getInfraExamples,
  getLastSelectedAssetId,
  setLastSelectedAssetId,
  pushInfraRecentSearch,
  getInfraRecentSearches,
  getInfraFeedbackByAsset,
};


