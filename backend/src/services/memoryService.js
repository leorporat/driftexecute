import { randomUUID } from "node:crypto";
import Supermemory from "supermemory";
import { STRATEGIES } from "../config/strategies.js";

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || "";
const PROFILE_PREFIX = "profile_state::";
const EVENT_PREFIX = "interaction_event::";
let client = null;

function defaultStrategyStats() {
  return STRATEGIES.reduce((acc, strategyName) => {
    acc[strategyName] = { success: 0, failure: 0 };
    return acc;
  }, {});
}

function ensureApiKey() {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Missing SUPERMEMORY_API_KEY in .env");
  }
}

function getClient() {
  if (client) return client;
  ensureApiKey();
  client = new Supermemory({
    apiKey: SUPERMEMORY_API_KEY,
  });
  return client;
}

function userContainerTag(userId) {
  return `user:${userId}`;
}

function parseTaggedJson(memoryText, prefix) {
  if (typeof memoryText !== "string" || !memoryText.startsWith(prefix)) {
    return null;
  }
  try {
    return JSON.parse(memoryText.slice(prefix.length));
  } catch {
    return null;
  }
}

async function searchMemories({ userId, query, limit }) {
  const data = await getClient().search.memories({
    q: query,
    containerTag: userContainerTag(userId),
    limit,
    searchMode: "memories",
  });

  if (!Array.isArray(data?.results)) return [];
  return data.results
    .map((result) => {
      if (typeof result.memory === "string") return result.memory;
      if (typeof result.chunk === "string") return result.chunk;
      if (typeof result.content === "string") return result.content;
      return null;
    })
    .filter((memory) => typeof memory === "string");
}

async function createMemory({ userId, memory, metadata }) {
  await getClient().add({
    content: memory,
    containerTags: [userContainerTag(userId)],
    metadata: metadata || {},
  });
}

async function loadLatestProfileMemory(userId) {
  const memories = await searchMemories({
    userId,
    query: PROFILE_PREFIX,
    limit: 30,
  });

  const parsed = memories
    .map((memory) => parseTaggedJson(memory, PROFILE_PREFIX))
    .filter(Boolean);

  if (!parsed.length) return null;

  parsed.sort((a, b) => {
    const aTime = new Date(a.updatedAt || 0).getTime();
    const bTime = new Date(b.updatedAt || 0).getTime();
    return bTime - aTime;
  });

  return parsed[0];
}

async function saveProfile(profile) {
  const payload = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  await createMemory({
    userId: profile.userId,
    memory: `${PROFILE_PREFIX}${JSON.stringify(payload)}`,
    metadata: { type: "user_profile" },
  });

  return payload;
}

export async function getUserProfile(userId) {
  const existing = await loadLatestProfileMemory(userId);
  if (existing) return existing;

  const profile = {
    userId,
    summary: "",
    strategyStats: defaultStrategyStats(),
  };

  await saveProfile(profile);
  return profile;
}

export async function getRecentEvents(userId, n = 10) {
  const searchLimit = Math.min(100, Math.max(n * 6, 40));
  const rawMemories = await searchMemories({
    userId,
    query: EVENT_PREFIX,
    limit: searchLimit,
  });

  const parsedEvents = rawMemories
    .map((memory) => parseTaggedJson(memory, EVENT_PREFIX))
    .filter(Boolean);

  // Keep only newest state per event id (helps when feedback writes an updated event version).
  parsedEvents.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.timestamp || 0).getTime();
    const bTime = new Date(b.updatedAt || b.timestamp || 0).getTime();
    return bTime - aTime;
  });

  const dedupedById = new Map();
  for (const event of parsedEvents) {
    if (!dedupedById.has(event.id)) {
      dedupedById.set(event.id, event);
    }
  }

  return Array.from(dedupedById.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, n);
}

export async function saveEvent(eventInput) {
  const event = {
    id: eventInput.id || randomUUID(),
    userId: eventInput.userId,
    taskText: eventInput.taskText,
    taskCategory: eventInput.taskCategory || "general",
    suggestedStrategy: eventInput.suggestedStrategy,
    executed: eventInput.executed ?? null,
    explanation: eventInput.explanation || "",
    microSteps: eventInput.microSteps || [],
    actionPayload: eventInput.actionPayload || null,
    timestamp: eventInput.timestamp || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await createMemory({
    userId: event.userId,
    memory: `${EVENT_PREFIX}${JSON.stringify(event)}`,
    metadata: { type: "interaction_event", eventId: event.id },
  });

  return event;
}

export async function updateStrategyStats(userId, strategy, executed) {
  if (typeof executed !== "boolean") {
    throw new Error("executed must be boolean");
  }

  const profile = await getUserProfile(userId);
  if (!profile.strategyStats[strategy]) {
    profile.strategyStats[strategy] = { success: 0, failure: 0 };
  }

  if (executed) profile.strategyStats[strategy].success += 1;
  else profile.strategyStats[strategy].failure += 1;

  return saveProfile(profile);
}

export async function markEventExecuted(userId, eventId, executed) {
  const idSearchMemories = await searchMemories({
    userId,
    query: eventId,
    limit: 100,
  });
  const idMatchedEvents = idSearchMemories
    .map((memory) => parseTaggedJson(memory, EVENT_PREFIX))
    .filter(Boolean);

  let event = idMatchedEvents.find((candidate) => candidate.id === eventId);
  if (!event) {
    const recentEvents = await getRecentEvents(userId, 100);
    event = recentEvents.find((candidate) => candidate.id === eventId);
  }

  if (!event) return null;

  const updatedEvent = {
    ...event,
    executed,
    updatedAt: new Date().toISOString(),
  };

  await createMemory({
    userId,
    memory: `${EVENT_PREFIX}${JSON.stringify(updatedEvent)}`,
    metadata: { type: "interaction_event", eventId: updatedEvent.id },
  });

  return updatedEvent;
}
