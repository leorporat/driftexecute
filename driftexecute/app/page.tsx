import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
      <section className="rounded-none border border-zinc-500 bg-panelSoft p-8 shadow-panel sm:p-12">
        <p className="mb-4 inline-flex rounded-none bg-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-orange-300">
          Local-first travel copilot
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Plan better trips using your own past travel history.
        </h1>
        <p className="read-box mt-5 max-w-2xl text-base leading-relaxed">
          Set preferences, add previous trips, review recommendations, and chat
          with a retrieval-aware assistant. Everything is saved in your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-none bg-accent px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-accentDeep"
            href="/login"
          >
            Get started
          </Link>
          <Link
            className="rounded-none border border-zinc-200 bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
            href="/trips"
          >
            Go to app
          </Link>
        </div>
      </section>
    </main>
  );
}





