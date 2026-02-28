# DriftExecute Backend

Minimal Express backend for adaptive execution planning.

## Structure

```
backend/
  package.json
  .env
  src/
    app.js
    server.js
    config/
      strategies.js
    routes/
      execute.js
      feedback.js
      profile.js
    services/
      executionService.js
      memoryService.js
      llmService.js
```

## Run

1. Install deps: `npm install`
2. Set env in `.env`:
   - `OPENAI_API_KEY=...`
   - `SUPERMEMORY_API_KEY=...`
   - optional: `OPENAI_MODEL=gpt-4o-mini`
   - optional: `PORT=3001`
3. Start: `npm run dev`

## API

### `POST /execute`
Body:
```json
{
  "userId": "user-123",
  "taskText": "I need to email my manager but I keep rewriting it",
  "taskCategory": "communication"
}
```

### `POST /feedback`
Body:
```json
{
  "userId": "user-123",
  "eventId": "<from execute>",
  "executed": true
}
```

### `GET /profile/:userId`
Returns user profile + recent events.

## Notes

- No vector DB is used.
- OpenAI is called only by `llmService`.
- Memory is managed by `memoryService` via Supermemory API.
