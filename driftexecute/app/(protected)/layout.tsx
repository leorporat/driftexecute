"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Nav } from "@/components/nav";
import { useSessionStore } from "@/store/session";

function initials(email: string | null): string {
  if (!email) {
    return "U";
  }
  return email.slice(0, 1).toUpperCase();
}

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const email = useSessionStore((state) => state.email);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);

  useEffect(() => {
    if (hasHydrated && !email) {
      router.replace("/login");
    }
  }, [email, hasHydrated, router]);

  if (!hasHydrated || !email) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-6">
        <p className="read-box text-sm">Checking session...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-700 p-4 sm:p-8">
      <div className="mx-auto grid min-h-[86vh] w-full max-w-[1280px] overflow-hidden border border-zinc-500 bg-panelSoft shadow-panel md:grid-cols-[240px_1fr]">
        <Nav />
        <div className="flex min-h-full flex-col bg-panelSoft">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-500 px-6 py-4">
            <div className="min-w-[240px] border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm text-zinc-400">
              Search asset IDs, clusters, or inspection notes...
            </div>
            <div className="flex items-center gap-2">
              <div className="white-chip">
                InfraPulse
              </div>
              <div className="border border-accent bg-zinc-700 px-3 py-1 text-xs font-semibold text-orange-300">
                Live Risk Feed
              </div>
              <div className="flex h-8 w-8 items-center justify-center border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-900">
                {initials(email)}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}



