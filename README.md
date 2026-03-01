# InfraPulse (Infrastructure-Only)

InfraPulse is a local-first infrastructure safety intelligence platform for roads and bridges.

It provides:
- map-level risk, safety band, and urgency signals
- activity clustering and inconsistency detection
- worker log/construction update ingestion
- immediate risk recalculation per affected asset
- SQLite-backed event persistence for reports/feedback snapshots

## Architecture

- Frontend (Next.js): `driftexecute/` on `:3000`
- Node backend (Express proxy/orchestrator): `backend/` on `:3001`
- Python ML API (FastAPI): `backend/python_api/` on `:8001`
- ML training/inference + datasets: `ml/`

## Run (dev)

From repo root:

```bash
npm install
npm run dev:all
```

Install Python deps (first run):

```bash
python3 -m pip install -r backend/python_api/requirements.txt
```

## Core APIs

- `GET /api/map/assets` -> GeoJSON assets with `risk_score`, `safety_band`, `urgency`, and risk factors.
- `GET /api/asset/:id` -> asset intelligence panel payload with recommendations.
- `POST /api/recommend` -> `assetRisk`, `areaHotspot`, `reportCluster` modes.
- `POST /api/reports/ingest` -> ingest one worker log/update and return updated asset + `risk_delta_24h`.
- `POST /api/reports/ingest-batch` -> ingest CSV/rows batch and return top changed assets.
- `POST /api/feedback` -> action ranking feedback loop.

## Safety Output

Each asset exposes:
- `risk_score` in `[0,1]`
- `safety_band` in `low|guarded|elevated|critical`
- `urgency` in `monitor|schedule_30d|schedule_7d|immediate_48h`
- `risk_factors` and ranked `recommended_actions`
