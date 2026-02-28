import type { AppStorageV1 } from "@/lib/types";

export const storageKey = "travel_mvp_v1";
const currentVersion = 1;

const emptyStorage: AppStorageV1 = {
  version: 1,
  preferences: null,
  trips: [],
  chatSessions: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function migrateStorage(raw: unknown): AppStorageV1 {
  if (!isRecord(raw)) {
    return { ...emptyStorage };
  }

  if (raw.version === currentVersion) {
    return {
      version: 1,
      preferences: (raw.preferences as AppStorageV1["preferences"]) ?? null,
      trips: Array.isArray(raw.trips) ? (raw.trips as AppStorageV1["trips"]) : [],
      chatSessions: Array.isArray(raw.chatSessions)
        ? (raw.chatSessions as AppStorageV1["chatSessions"])
        : [],
    };
  }

  return {
    version: 1,
    preferences: (raw.preferences as AppStorageV1["preferences"]) ?? null,
    trips: Array.isArray(raw.trips) ? (raw.trips as AppStorageV1["trips"]) : [],
    chatSessions: Array.isArray(raw.chatSessions)
      ? (raw.chatSessions as AppStorageV1["chatSessions"])
      : [],
  };
}

export function loadStorage(): AppStorageV1 {
  if (typeof window === "undefined") {
    return { ...emptyStorage };
  }

  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return { ...emptyStorage };
  }

  try {
    return migrateStorage(JSON.parse(raw));
  } catch {
    return { ...emptyStorage };
  }
}

export function saveStorage(next: AppStorageV1): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(next));
}

export function updateStorage(mutator: (current: AppStorageV1) => AppStorageV1): AppStorageV1 {
  const current = loadStorage();
  const next = mutator(current);
  saveStorage(next);
  return next;
}

export function resetStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(storageKey);
}


