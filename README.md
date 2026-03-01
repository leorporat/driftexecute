# InfraPulse (MVP)

InfraPulse is a local-first infrastructure intelligence MVP for roads and bridges.

It combines:
- map-level risk + inconsistency signals
- heightened activity clustering
- inspection note ingestion (voice/text)
- offline synthetic datasets + local ML indexing

## Architecture

- Frontend (Next.js): `driftexecute/` on `:3000`
- Node backend (Express proxy/orchestrator): `backend/` on `:3001`
- Python ML API (FastAPI): `backend/python_api/` on `:8001`
- ML training/inference + datasets: `ml/`

## Run (dev)

From repo root (`driftexecute/`):

```bash
npm install
npm run dev:all
```

In another terminal (first run or dependency refresh):

```bash
pip install -r backend/python_api/requirements.txt
```

The ML API auto-builds artifacts and synthetic datasets on startup when missing.

## What It Does

- `GET /api/map/assets` -> GeoJSON points with risk, inconsistency, activity.
- `GET /api/asset/:id` -> full asset intelligence panel payload.
- `POST /api/recommend` -> `assetRisk`, `areaHotspot`, `reportCluster`.
- `POST /api/reports/ingest` -> add new voice/manual note and update scores.
- `POST /api/feedback` -> action ranking feedback loop.

## Demo Flow

1. Open **Map**, set a high risk threshold, click a hotspot asset.
2. Review **inconsistency** + **cause hypotheses** + recommended actions.
3. Open **Inspect (Voice)**, ingest a new note, then return to Map and confirm updated risk/activity.

