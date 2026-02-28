"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SessionState {
  email: string | null;
  hasHydrated: boolean;
  setEmail: (email: string) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      email: null,
      hasHydrated: false,
      setEmail: (email) => set({ email }),
      clearSession: () => set({ email: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "travel_mvp_session",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
