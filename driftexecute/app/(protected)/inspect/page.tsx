"use client";

import { useEffect, useRef, useState } from "react";
import { getInfraExamples, ingestInfraReport, setLastSelectedAssetId } from "@/lib/api/client";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
};

function getSpeechRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export default function InspectPage() {
  const [assetId, setAssetId] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState(3);
  const [imageUrl, setImageUrl] = useState("");
  const [supportsSpeech, setSupportsSpeech] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [examples, setExamples] = useState<{ asset_ids: string[]; voice_notes: string[] }>({
    asset_ids: [],
    voice_notes: [],
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const ctor = getSpeechRecognitionCtor();
    setSupportsSpeech(Boolean(ctor));
    if (!ctor) return;
    const recognition: SpeechRecognitionLike = new ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((item: any) => item[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setDescription(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadExamples = async () => {
      try {
        const payload = await getInfraExamples();
        if (!mounted) return;
        setExamples(payload);
        if (!assetId && payload.asset_ids[0]) {
          setAssetId(payload.asset_ids[0]);
        }
      } catch {
        // non-fatal
      }
    };
    void loadExamples();
    return () => {
      mounted = false;
    };
  }, [assetId]);

  const toggleRecording = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (recording) {
      recognition.stop();
      setRecording(false);
    } else {
      setError(null);
      recognition.start();
      setRecording(true);
    }
  };

  const submit = async () => {
    if (!assetId.trim() || !description.trim()) {
      setError("Asset ID and note are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = await ingestInfraReport({
        asset_id: assetId.trim(),
        source: supportsSpeech ? "voice" : "manual",
        description: description.trim(),
        severity,
        image_url: imageUrl.trim() || undefined,
      });
      setResult(payload);
      setLastSelectedAssetId(assetId.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Inspect (Voice)</h1>
      <p className="read-box text-sm">
        Submit real-time inspection notes by voice (if supported) or text. Risk/activity scores update immediately.
      </p>

      <div className="grid gap-4 rounded-none border border-zinc-500 bg-panelSoft p-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-zinc-300">
          Asset ID
          <input
            className="mt-1 w-full border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm"
            list="asset-options"
            onChange={(event) => setAssetId(event.target.value)}
            value={assetId}
          />
          <datalist id="asset-options">
            {examples.asset_ids.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </label>

        <label className="text-sm font-semibold text-zinc-300">
          Severity ({severity})
          <input
            className="mt-3 w-full accent-orange-500"
            max={5}
            min={1}
            onChange={(event) => setSeverity(Number(event.target.value))}
            type="range"
            value={severity}
          />
        </label>

        <label className="md:col-span-2 text-sm font-semibold text-zinc-300">
          {supportsSpeech ? "Voice transcript" : "Simulated voice note"}
          <textarea
            className="mt-1 min-h-28 w-full border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              supportsSpeech
                ? "Press Record Note, speak your inspection details, then review text."
                : "Type the inspection note that would have come from voice."
            }
            value={description}
          />
        </label>

        <label className="md:col-span-2 text-sm font-semibold text-zinc-300">
          Optional image URL
          <input
            className="mt-1 w-full border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm"
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://..."
            value={imageUrl}
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button
            className="border border-zinc-500 bg-zinc-700 px-4 py-2 text-xs font-semibold hover:border-orange-400"
            disabled={!supportsSpeech}
            onClick={toggleRecording}
            type="button"
          >
            {recording ? "Stop Recording" : "Record Note"}
          </button>
          <button
            className="border border-accent bg-accent px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-accentDeep disabled:opacity-60"
            disabled={submitting}
            onClick={() => {
              void submit();
            }}
            type="button"
          >
            {submitting ? "Submitting..." : "Submit Inspection"}
          </button>
        </div>
      </div>

      {error ? <p className="read-box text-sm text-rose-300">{error}</p> : null}

      {result ? (
        <div className="border border-zinc-500 bg-panelSoft p-4 shadow-panel">
          <h2 className="text-lg font-semibold text-zinc-100">Updated asset signal</h2>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-200">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}

      {examples.voice_notes.length > 0 ? (
        <div className="border border-zinc-500 bg-panelSoft p-4">
          <p className="text-sm font-semibold text-zinc-100">Demo voice-note starters</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {examples.voice_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

