"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { InfraAssetFeature } from "@/lib/types";

interface InfraMapCanvasProps {
  assets: InfraAssetFeature[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
}

function riskColor(score: number): string {
  if (score >= 0.75) return "#ef4444";
  if (score >= 0.55) return "#f97316";
  if (score >= 0.35) return "#facc15";
  return "#22c55e";
}

function riskRadius(score: number): number {
  return 5 + Math.round(score * 7);
}

function haloRadius(score: number): number {
  return riskRadius(score) + 6;
}

function FitToAssets({ assets, selectedAssetId }: { assets: InfraAssetFeature[]; selectedAssetId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (assets.length === 0) {
      return;
    }
    if (selectedAssetId) {
      const selected = assets.find((asset) => asset.properties.asset_id === selectedAssetId);
      if (selected) {
        map.flyTo([selected.geometry.coordinates[1], selected.geometry.coordinates[0]], 13, {
          duration: 0.6,
        });
        return;
      }
    }
    const lats = assets.map((feature) => feature.geometry.coordinates[1]);
    const lons = assets.map((feature) => feature.geometry.coordinates[0]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ];
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [assets, map, selectedAssetId]);

  return null;
}

export function InfraMapCanvas({ assets, selectedAssetId, onSelectAsset }: InfraMapCanvasProps) {
  const MapContainerCompat = MapContainer as any;
  const TileLayerCompat = TileLayer as any;
  const CircleMarkerCompat = CircleMarker as any;

  return (
    <div className="h-[560px] w-full overflow-hidden border border-zinc-500">
      <MapContainerCompat center={[41.8781, -87.6298]} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayerCompat
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        />
        <TileLayerCompat
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
        />
        <FitToAssets assets={assets} selectedAssetId={selectedAssetId} />
        {assets.map((asset) => {
          const score = asset.properties.risk_score;
          const selected = asset.properties.asset_id === selectedAssetId;
          return (
            <div key={asset.properties.asset_id}>
              {score >= 0.6 ? (
                <CircleMarkerCompat
                  center={[asset.geometry.coordinates[1], asset.geometry.coordinates[0]]}
                  interactive={false}
                  pathOptions={{
                    color: "transparent",
                    fillColor: riskColor(score),
                    fillOpacity: selected ? 0.2 : 0.12,
                  }}
                  radius={haloRadius(score)}
                />
              ) : null}
              <CircleMarkerCompat
                center={[asset.geometry.coordinates[1], asset.geometry.coordinates[0]]}
                eventHandlers={{
                  click: () => onSelectAsset(asset.properties.asset_id),
                }}
                pathOptions={{
                  color: selected ? "#ffffff" : "#111827",
                  weight: selected ? 2 : 1,
                  fillColor: riskColor(score),
                  fillOpacity: selected ? 0.98 : 0.76,
                }}
                radius={riskRadius(score)}
              />
            </div>
          );
        })}
      </MapContainerCompat>
    </div>
  );
}
