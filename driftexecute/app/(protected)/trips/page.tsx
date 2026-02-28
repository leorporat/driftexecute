"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteTrip, listTrips } from "@/lib/api/client";
import type { Trip } from "@/lib/types";
import { TripCard } from "@/components/trip-card";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const next = await listTrips();
    setTrips(next);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleDelete = async (tripId: string) => {
    await deleteTrip(tripId);
    await refresh();
  };

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Past Trips</h1>
          <p className="text-sm text-slate-600">Add travel history used for recommendations and chat retrieval.</p>
        </div>
        <Link
          className="rounded-none bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          href="/trips/new"
        >
          Add trip
        </Link>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading trips...</p> : null}

      {!loading && trips.length === 0 ? (
        <div className="rounded-none bg-panel p-8 text-sm text-slate-600 shadow-panel">
          No trips yet. Add your first trip to power retrieval and recommendations.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {trips.map((trip) => (
          <TripCard key={trip.id} onDelete={handleDelete} trip={trip} />
        ))}
      </div>
    </section>
  );
}


