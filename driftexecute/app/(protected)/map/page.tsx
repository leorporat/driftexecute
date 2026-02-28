"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getInfraAssetDetails,
  getInfraHotspots,
  getInfraMapAssets,
  getLastSelectedAssetId,
  setLastSelectedAssetId,
  submitInfraFeedback,
} from "@/lib/api/client";
import type { InfraAssetDetailsResponse, InfraAssetFeature } from "@/lib/types";

const InfraMapCanvas = dynamic(
  () => import("@/components/infra-map-canvas").then((mod) => mod.InfraMapCanvas),
  { ssr: false },
);

type AssetTypeFilter = "all" | "road" | "bridge";

export default function MapPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [assetType, setAssetType] = useState<AssetTypeFilter>("all");
  const [minRisk, setMinRisk] = useState(0.35);
  const [onlyInconsistent, setOnlyInconsistent] = useState(false);
  const [assets, setAssets] = useState<InfraAssetFeature[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetDetails, setAssetDetails] = useState<InfraAssetDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    const initial = getLastSelectedAssetId();
    if (initial) {
      setSelectedAssetId(initial);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      setLoading(true);
      const geo = await getInfraMapAssets(assetType);
      if (!mounted) return;
      setAssets(Array.isArray(geo.features) ? geo.features : []);
      setLoading(false);
    };
    void loadAssets();
    return () => {
      mounted = false;
    };
  }, [assetType]);

  useEffect(() => {
    const latRaw = searchParams.get("lat");
    const lonRaw = searchParams.get("lon");
    const lat = latRaw ? Number(latRaw) : null;
    const lon = lonRaw ? Number(lonRaw) : null;
    if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) {
      return;
    }
    let mounted = true;
    const loadHotspots = async () => {
      try {
        const rows = await getInfraHotspots({ lat, lon, radius_km: 10 });
        if (!mounted || rows.length === 0) return;
        const next = rows[0]?.asset_id;
        if (typeof next === "string") setSelectedAssetId(next);
      } catch {
        // non-fatal
      }
    };
    void loadHotspots();
    return () => {
      mounted = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!selectedAssetId) {
      setAssetDetails(null);
      return;
    }
    setLastSelectedAssetId(selectedAssetId);
    let mounted = true;
    const loadDetails = async () => {
      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const details = await getInfraAssetDetails(selectedAssetId);
        if (!mounted) return;
        setAssetDetails(details);
      } catch (error) {
        if (!mounted) return;
        setDetailsError(error instanceof Error ? error.message : "Could not load asset details.");
      } finally {
        if (mounted) setDetailsLoading(false);
      }
    };
    void loadDetails();
    return () => {
      mounted = false;
    };
  }, [selectedAssetId]);

  const filteredAssets = useMemo(
    () =>
      assets.filter((feature) => {
        const props = feature.properties;
        if (props.risk_score < minRisk) return false;
        if (onlyInconsistent && props.inconsistency_score < 0.45) return false;
        return true;
      }),
    [assets, minRisk, onlyInconsistent],
  );

  const selectedStats = assetDetails?.asset;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Infrastructure Risk Map</h1>
        <p className="read-box mt-2 text-sm">
          Roads and bridges with risk, inconsistency, and activity overlays.
        </p>
      </div>

      <div className="grid gap-3 rounded-none border border-zinc-500 bg-panelSoft p-4 md:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          Asset type
          <select
            className="mt-1 w-full border border-zinc-500 bg-zinc-700 px-2 py-2 text-sm"
            onChange={(event) => setAssetType(event.target.value as AssetTypeFilter)}
            value={assetType}
          >
            <option value="all">All</option>
            <option value="road">Roads</option>
            <option value="bridge">Bridges</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-300 md:col-span-2">
          Minimum risk ({minRisk.toFixed(2)})
          <input
            className="mt-3 w-full accent-orange-500"
            max={1}
            min={0}
            onChange={(event) => setMinRisk(Number(event.target.value))}
            step={0.01}
            type="range"
            value={minRisk}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <input
            checked={onlyInconsistent}
            onChange={(event) => setOnlyInconsistent(event.target.checked)}
            type="checkbox"
          />
          High inconsistency only
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-none border border-zinc-500 bg-panelSoft p-3">
          {loading ? (
            <p className="read-box p-3 text-sm">Loading map assets...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="read-box p-3 text-sm">No assets match your current filter.</p>
          ) : (
            <InfraMapCanvas
              assets={filteredAssets}
              onSelectAsset={setSelectedAssetId}
              selectedAssetId={selectedAssetId}
            />
          )}
        </div>

        <aside className="rounded-none border border-zinc-500 bg-panelSoft p-4 shadow-panel">
          <h2 className="text-lg font-bold text-zinc-100">Asset Intelligence</h2>
          {!selectedAssetId ? (
            <p className="read-box mt-3 text-sm">Select a marker to inspect risk and causes.</p>
          ) : detailsLoading ? (
            <p className="read-box mt-3 text-sm">Loading asset details...</p>
          ) : detailsError ? (
            <p className="read-box mt-3 text-sm text-rose-300">{detailsError}</p>
          ) : assetDetails && selectedStats ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="border border-zinc-500 bg-zinc-700 p-3">
                <p className="font-semibold text-zinc-100">
                  {String(selectedStats.name)} ({String(selectedStats.asset_id)})
                </p>
                <p className="mt-1 text-zinc-300">
                  Risk {Number(selectedStats.risk_score).toFixed(2)} • Confidence{" "}
                  {Number(selectedStats.confidence).toFixed(2)}
                </p>
                <p className="text-zinc-300">
                  Activity {Number(selectedStats.activity_score).toFixed(2)} • Inconsistency{" "}
                  {Number(selectedStats.inconsistency_score).toFixed(2)}
                </p>
              </div>

              <div className="border border-zinc-500 bg-zinc-700 p-3">
                <p className="font-semibold text-zinc-100">Cause hypotheses</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-200">
                  {assetDetails.cause_hypotheses.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-zinc-500 bg-zinc-700 p-3">
                <p className="font-semibold text-zinc-100">Recommended actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assetDetails.recommended_actions.slice(0, 5).map((action) => (
                    <span className="white-chip" key={action}>
                      {action}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border border-zinc-500 bg-zinc-700 p-3">
                <p className="font-semibold text-zinc-100">Similar assets</p>
                <ul className="mt-2 space-y-1 text-zinc-200">
                  {assetDetails.similar_assets.slice(0, 5).map((item) => (
                    <li key={item.asset_id}>
                      {item.name} ({item.asset_id}) sim={item.similarity.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-zinc-500 bg-zinc-700 p-3">
                <p className="font-semibold text-zinc-100">Recent reports</p>
                <ul className="mt-2 space-y-2">
                  {assetDetails.last_reports.slice(0, 6).map((report) => (
                    <li className="border border-zinc-600 p-2" key={report.report_id}>
                      <p className="text-xs text-zinc-300">
                        {report.report_type} • severity {report.severity} • {report.source}
                      </p>
                      <p className="text-zinc-100">{report.description}</p>
                      {report.image_url ? (
                        <a
                          className="text-xs text-orange-300 underline"
                          href={report.image_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          image link
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2">
                <button
                  className="border border-zinc-500 bg-zinc-700 px-3 py-2 text-xs font-semibold hover:border-orange-400"
                  onClick={() =>
                    void submitInfraFeedback({
                      asset_id: selectedAssetId,
                      helpful: true,
                      chosen_action: assetDetails.recommended_actions[0] || "inspection",
                    })
                  }
                  type="button"
                >
                  Feedback: helpful
                </button>
                <button
                  className="border border-zinc-500 bg-zinc-700 px-3 py-2 text-xs font-semibold hover:border-orange-400"
                  onClick={() =>
                    void submitInfraFeedback({
                      asset_id: selectedAssetId,
                      helpful: false,
                      reason: "Needs different prioritization",
                      chosen_action: assetDetails.recommended_actions[0] || "inspection",
                    })
                  }
                  type="button"
                >
                  Feedback: not helpful
                </button>
              </div>
            </div>
          ) : (
            <p className="read-box mt-3 text-sm">No details available for this asset.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
