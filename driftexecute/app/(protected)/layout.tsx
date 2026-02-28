"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Nav } from "@/components/nav";
import { useSessionStore } from "@/store/session";

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
        <p className="text-sm text-slate-600">Checking session...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

