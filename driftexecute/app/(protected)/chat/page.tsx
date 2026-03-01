import Link from "next/link";

export default function ChatPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Assistant (Legacy)</h1>
      <p className="read-box text-sm">
        The old travel chat module is disabled in the InfraPulse build.
      </p>
      <p className="text-sm text-zinc-300">
        Use <Link className="text-orange-400 underline" href="/map">Map</Link>,{" "}
        <Link className="text-orange-400 underline" href="/activity">Activity</Link>, and{" "}
        <Link className="text-orange-400 underline" href="/inspect">Inspect</Link> for the live demo.
      </p>
    </section>
  );
}




