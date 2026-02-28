"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

const links = [
  { href: "/trips", label: "Trips" },
  { href: "/onboarding/preferences", label: "Preferences" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/chat", label: "Chat" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const email = useSessionStore((state) => state.email);
  const clearSession = useSessionStore((state) => state.clearSession);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link className="text-lg font-bold tracking-tight text-slate-900" href="/">
          DriftExecute
        </Link>
        <ul className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  className={`rounded-none px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-sky-100 text-sky-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>
          <button
            className="rounded-none border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
            type="button"
          >
            Log out
          </button>
        </div>
      </nav>
    </header>
  );
}


