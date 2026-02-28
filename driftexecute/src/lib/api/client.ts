import { rankTripsBySimilarity, tokenize, tripToDocument } from "@/lib/similarity";
import { loadStorage, updateStorage } from "@/lib/storage";
import type {
  ChatMessage,
  ChatResponse,
  ChatSession,
  Constraint,
  CreateTripInput,
  Interest,
  Pace,
  Preference,
  PreferenceInput,
  Recommendation,
  SimilarTripResult,
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

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
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
};


