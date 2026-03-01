import Link from "next/link";

export default function PreferencesPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Legacy Onboarding</h1>
      <p className="read-box text-sm">
        Travel onboarding preferences are disabled in this InfraPulse build.
      </p>
      <p className="text-sm text-zinc-300">
        Continue to <Link className="text-orange-400 underline" href="/map">Map</Link> and use live infrastructure signals.
      </p>
    </section>
  );
}





