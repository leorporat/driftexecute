import type { Trip } from "@/lib/types";

interface TripCardProps {
  trip: Trip;
  onDelete: (tripId: string) => void;
}

export function TripCard({ trip, onDelete }: TripCardProps) {
  return (
    <article className="rounded-none bg-panel p-5 shadow-panel">
      {trip.photoDataUrl ? (
        <img
          alt={`${trip.title} photo`}
          className="mb-4 h-44 w-full rounded-none border border-slate-200 object-cover"
          src={trip.photoDataUrl}
        />
      ) : (
        <div className="mb-4 flex h-44 w-full items-center justify-center rounded-none border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-500">
          No photo
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{trip.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{trip.destinations.join(", ")}</p>
        </div>
        <button
          className="rounded-none border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          onClick={() => onDelete(trip.id)}
          type="button"
        >
          Delete
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Cost</dt>
          <dd className="font-semibold">${trip.totalCost.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Rating</dt>
          <dd className="font-semibold">{trip.rating}/10</dd>
        </div>
      </dl>
      {trip.tags.length > 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold">Tags:</span> {trip.tags.join(", ")}
        </p>
      ) : null}
      {trip.highlights ? (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold">Highlights:</span> {trip.highlights}
        </p>
      ) : null}
      {trip.painPoints ? (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold">Pain points:</span> {trip.painPoints}
        </p>
      ) : null}
    </article>
  );
}


