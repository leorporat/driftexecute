# InfraPulse Frontend

Next.js UI for infrastructure risk + activity intelligence.

## Key Pages

- `/map` - risk hotspots + asset drawer
- `/activity` - heightened activity clusters
- `/inspect` - voice/text inspection note ingestion

## Environment

Optional `.env.local`:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- `NEXT_PUBLIC_ML_API_BASE_URL=http://127.0.0.1:8001`

## Local Run

Use monorepo root script:

```bash
npm run dev:all
```

