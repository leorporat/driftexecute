"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInfraActivityFeed, getInfraHotspots, pushInfraRecentSearch } from "@/lib/api/client";
import type { InfraClusterItem } from "@/lib/types";

export default function ActivityPage() {
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<InfraClusterItem[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<InfraClusterItem | null>(null);
  const [hotspots, setHotspots] = useState<Record<string, unknown>[]>([]);
  const [hotspotLoading, setHotspotLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const rows = await getInfraActivityFeed();
      if (!mounted) return;
      setClusters(rows);
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const inspectCluster = async (item: InfraClusterItem) => {
    setSelectedCluster(item);
    pushInfraRecentSearch(`cluster:${item.cluster_id}`);
    if (item.center_lat == null || item.center_lon == null) {
      setHotspots([]);
      return;
    }
    setHotspotLoading(true);
    const rows = await getInfraHotspots({
      lat: item.center_lat,
      lon: item.center_lon,
      radius_km: 8,
    });
    setHotspots(rows);
    setHotspotLoading(false);
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Heightened Activity Feed</h1>
      <p className="read-box text-sm">
        Clusters of increasing reports and recurring infrastructure failure language in the last 30 days.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {loading ? (
            <p className="read-box text-sm">Loading activity clusters...</p>
          ) : clusters.length === 0 ? (
            <p className="read-box text-sm">No elevated activity detected.</p>
          ) : (
            clusters.map((item) => (
              <article
                className="border border-zinc-500 bg-panelSoft p-4 shadow-panel"
                key={item.cluster_id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Cluster #{item.cluster_id} • {item.count_30d} reports (30d)
                  </h2>
                  <button
                    className="border border-zinc-500 bg-zinc-700 px-3 py-1 text-xs font-semibold hover:border-orange-400"
                    onClick={() => {
                      void inspectCluster(item);
                    }}
                    type="button"
                  >
                    Analyze cluster
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-200">{item.cause_hypothesis}</p>
                <p className="mt-1 text-xs text-zinc-300">
                  Top terms: {item.top_terms.join(", ")} • 7d: {item.count_7d} • affected assets:{" "}
                  {item.affected_assets}
                </p>
                {item.center_lat != null && item.center_lon != null ? (
                  <Link
                    className="mt-2 inline-block text-xs font-semibold text-orange-300 underline"
                    href={`/map?lat=${item.center_lat}&lon=${item.center_lon}`}
                  >
                    Open center on map
                  </Link>
                ) : null}
              </article>
            ))
          )}
        </div>

        <aside className="border border-zinc-500 bg-panelSoft p-4 shadow-panel">
          <h2 className="text-lg font-semibold text-zinc-100">Cluster hotspot assets</h2>
          {!selectedCluster ? (
            <p className="read-box mt-3 text-sm">Select a cluster to see nearby high-risk assets.</p>
          ) : hotspotLoading ? (
            <p className="read-box mt-3 text-sm">Analyzing nearby hotspots...</p>
          ) : hotspots.length === 0 ? (
            <p className="read-box mt-3 text-sm">No hotspot list available for this cluster.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {hotspots.slice(0, 10).map((item) => (
                <li className="border border-zinc-600 bg-zinc-700 p-2" key={String(item.asset_id)}>
                  <p className="font-semibold text-zinc-100">
                    {String(item.name)} ({String(item.asset_id)})
                  </p>
                  <p className="text-zinc-300">
                    Risk {Number(item.risk_score || 0).toFixed(2)} • Activity{" "}
                    {Number(item.activity_score || 0).toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}

