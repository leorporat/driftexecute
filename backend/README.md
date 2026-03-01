# InfraPulse Backend

Express proxy/orchestrator for the InfraPulse ML API.

## Run

1. Install deps: `npm install`
2. Optional env in `.env`:
   - `PORT=3001`
   - `ML_API_BASE_URL=http://127.0.0.1:8001`
3. Start: `npm run dev`

## API

### Health
- `GET /health`

### Infrastructure intelligence
- `GET /api/map/assets?type=all|road|bridge`
- `GET /api/asset/:id`
- `POST /api/recommend`
- `POST /api/reports/ingest`
- `POST /api/reports/ingest-batch`
- `POST /api/feedback`
- `GET /api/examples`

## Notes

- Backend is now infrastructure-only.
- Legacy travel and execution-assistant routes were removed.
- ML persistence is handled in the Python API using SQLite.
