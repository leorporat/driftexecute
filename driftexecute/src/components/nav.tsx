"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

const links = [
  { href: "/map", label: "Map" },
  { href: "/activity", label: "Activity" },
  { href: "/inspect", label: "Inspect (Voice)" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const email = useSessionStore((state) => state.email);
  const clearSession = useSessionStore((state) => state.clearSession);

  return (
    <aside className="flex h-full flex-col border-r border-zinc-500 bg-panel px-4 py-6">
      <Link className="mb-8 px-2 text-5xl font-bold tracking-tight text-accent" href="/">
        pulse
      </Link>

      <ul className="space-y-2">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                className={`block border-l-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-accent bg-zinc-700 text-zinc-100"
                    : "border-transparent text-zinc-400 hover:border-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
                }`}
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-4">
        <div className="border border-zinc-200 bg-zinc-100 px-3 py-3 text-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wider">Pro tip</p>
          <p className="mt-1 text-sm font-semibold">Start at Map, then ingest a new inspection note.</p>
        </div>
        <div className="border border-zinc-500 bg-zinc-700 px-3 py-3">
          <p className="truncate text-xs text-zinc-400">{email}</p>
          <button
            className="mt-2 w-full border border-zinc-500 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-accent hover:text-accent"
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
            type="button"
          >
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
