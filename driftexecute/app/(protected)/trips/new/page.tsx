import Link from "next/link";

export default function NewTripPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Legacy Trip Form</h1>
      <p className="read-box text-sm">
        Trip creation is disabled in InfraPulse.
      </p>
      <p className="text-sm text-zinc-300">
        Return to <Link className="text-orange-400 underline" href="/map">Map</Link> and use Inspect to ingest field notes.
      </p>
    </section>
  );
}





