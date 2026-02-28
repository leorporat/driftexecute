# DriftExecute Frontend MVP

Next.js (App Router) + TypeScript + Tailwind frontend-only travel planning MVP.

## Tech Stack

- Next.js 14+ App Router
- TypeScript
- Tailwind CSS
- Zustand
- React Hook Form + Zod
- Local persistence via `localStorage` (`travel_mvp_v1`)

## Features

- Landing + simulated email-only login
- Protected routes with local session gating
- Preferences onboarding form
- Past trip creation + listing + deletion
- Retrieval-backed recommendations (top 3 with rationale)
- Multi-turn chat assistant with local similarity citations
- Versioned local schema + migration entrypoint
- Local API abstraction in `src/lib/api/client.ts` for easy backend swap later

## Install (pnpm)

```bash
pnpm install
```

## Run Dev

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Backend Integration (Local Testing)

Run Node backend in a separate terminal:

```bash
cd /Users/leorporat/Documents/Projects/driftexecute/backend
npm install
npm run dev
```

Required backend env keys in `backend/.env`:

- `OPENAI_API_KEY`
- `SUPERMEMORY_API_KEY`

Run ML API in another terminal:

```bash
cd /Users/leorporat/Documents/Projects/driftexecute
pip install -r backend/python_api/requirements.txt
uvicorn backend.python_api.main:app --reload --port 8001
```

Then run frontend:

```bash
cd /Users/leorporat/Documents/Projects/driftexecute/driftexecute
npm install
npm run dev
```

Optional frontend env (`driftexecute/.env.local`):

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- `NEXT_PUBLIC_ML_API_BASE_URL=http://127.0.0.1:8001`

If omitted, frontend defaults to:

- Node backend: `http://localhost:3001`
- ML backend: `http://127.0.0.1:8001`

## Reset Local Data

Use browser devtools console:

```js
localStorage.removeItem("travel_mvp_v1");
localStorage.removeItem("travel_mvp_session");
```

Then refresh the page.
