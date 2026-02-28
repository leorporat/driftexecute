import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
      <section className="rounded-none bg-panel p-8 shadow-panel sm:p-12">
        <p className="mb-4 inline-flex rounded-none bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sky-800">
          Local-first travel copilot
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Plan better trips using your own past travel history.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
          Set preferences, add previous trips, review recommendations, and chat
          with a retrieval-aware assistant. Everything is saved in your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-none bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
            href="/login"
          >
            Get started
          </Link>
          <Link
            className="rounded-none border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/trips"
          >
            Go to app
          </Link>
        </div>
      </section>
    </main>
  );
}


