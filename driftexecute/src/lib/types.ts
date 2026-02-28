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

export interface AppStorageV1 {
  version: 1;
  preferences: Preference | null;
  trips: Trip[];
  chatSessions: ChatSession[];
}
