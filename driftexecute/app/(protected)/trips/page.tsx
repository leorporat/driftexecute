import Link from "next/link";

export default function TripsPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Legacy Trips Module</h1>
      <p className="read-box text-sm">
        Travel trip management is disabled in InfraPulse.
      </p>
      <p className="text-sm text-zinc-300">
        Go to <Link className="text-orange-400 underline" href="/map">Map</Link> to inspect infrastructure assets.
      </p>
    </section>
  );
}





