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

## Reset Local Data

Use browser devtools console:

```js
localStorage.removeItem("travel_mvp_v1");
localStorage.removeItem("travel_mvp_session");
```

Then refresh the page.
