"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RecommendationCard } from "@/components/recommendation-card";
import { getPreferences, getRecommendations, listTrips } from "@/lib/api/client";
import type { Preference, Recommendation } from "@/lib/types";

export default function RecommendationsPage() {
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [preferences, setPreferences] = useState<Preference | null>(null);
  const [tripCount, setTripCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const [prefs, trips, recs] = await Promise.all([
        getPreferences(),
        listTrips(),
        getRecommendations(),
      ]);
      if (!mounted) {
        return;
      }
      setPreferences(prefs);
      setTripCount(trips.length);
      setRecommendations(recs);
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <p className="read-box text-sm">Generating recommendations...</p>;
  }

  if (!preferences) {
    return (
      <div className="read-box rounded-none p-8 text-sm shadow-panel">
        Save your preferences first.
        <Link className="ml-2 font-semibold text-orange-400 hover:text-orange-300" href="/onboarding/preferences">
          Go to Preferences
        </Link>
      </div>
    );
  }

  if (tripCount === 0) {
    return (
      <div className="read-box rounded-none p-8 text-sm shadow-panel">
        Add at least one trip to generate retrieval-backed recommendations.
        <Link className="ml-2 font-semibold text-orange-400 hover:text-orange-300" href="/trips/new">
          Add Trip
        </Link>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="read-box rounded-none p-8 text-sm shadow-panel">
        No recommendations yet. Try adding richer trip notes and tags.
      </div>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-zinc-100">Recommended Destinations</h1>
      <p className="read-box mt-3 text-sm">
        Top 3 destinations based on preferences + your past trips.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {recommendations.slice(0, 3).map((item) => (
          <RecommendationCard key={item.id} recommendation={item} />
        ))}
      </div>
    </section>
  );
}





