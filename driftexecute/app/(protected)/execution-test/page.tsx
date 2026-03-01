import Link from "next/link";

export default function ExecutionTestPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Execution Test (Legacy)</h1>
      <p className="read-box text-sm">
        This route was used for an older backend test harness and is disabled for InfraPulse deployment.
      </p>
      <p className="text-sm text-zinc-300">
        Use <Link className="text-orange-400 underline" href="/inspect">Inspect</Link> to ingest notes and test live updates.
      </p>
    </section>
  );
}
