---
name: PK Jobs stack
description: Tech stack decisions for NexHire — what is used and why
---

# NexHire — Stack Decisions

## Database: MongoDB via Mongoose (NOT Drizzle/Postgres)
The workspace monorepo has a `lib/db` Drizzle/Postgres package, but this project uses **MongoDB Atlas via Mongoose** for all job data. Do not import from `lib/db`.

**Why:** Jobs need vector search (Atlas Vector Search), flexible schema for scraped job data, and upsert-by-source patterns. Relational DB doesn't fit well.

**How to apply:** Import models from `artifacts/api-server/src/models/`. Connect via `connectMongo()` from `artifacts/api-server/src/lib/mongodb.ts`.

## AI: Gemini via @google/generative-ai
- Embeddings: `text-embedding-004` (768 dimensions)
- Analysis: `gemini-2.0-flash`
- Rate limit: 30 AI analysis calls/user/hour via in-memory store (`src/lib/rateLimit.ts`)

## Auth: Clerk cookie-based (web)
- Web frontend uses cookie sessions — do NOT set `setAuthTokenGetter` or add Bearer headers
- `requireAuth` middleware: `getAuth(req).userId` from `@clerk/express`
- Proxy middleware handles production CNAME-free auth at `/api/__clerk`

## Frontend API client
- Orval-generated hooks from `@workspace/api-client-react`
- Base URL: empty string in dev (Vite proxy handles `/api` → `localhost:8080`)
- `setBaseUrl` called in `main.tsx` — set `VITE_API_BASE_URL` in production
