---
name: PK Jobs first-run setup
description: What must be done after deployment before the app actually works end-to-end
---

# First-Run Setup Required

## 1. MongoDB Atlas Vector Search Index
Before AI job matching works, create this index in MongoDB Atlas on the `jobs` collection:

```json
{
  "name": "job_embedding_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 768,
        "similarity": "cosine"
      }
    ]
  }
}
```

Without this, vector search throws an error and the code falls back to showing the most recent jobs (graceful degradation).

## 2. Trigger Initial Adzuna Sync
The database starts empty. Call the sync endpoint to populate jobs:

```bash
curl -X POST https://<domain>/api/cron/sync-adzuna \
  -H "Authorization: Bearer $CRON_SECRET"
```

This fetches up to 500 jobs from Adzuna Pakistan, generates embeddings, and upserts to MongoDB.

**Only ingests jobs posted on/after 2026-01-01.**

## 3. Set Up Recurring Sync
Set up a cron job (e.g. cron-job.org, GitHub Actions schedule) to call the sync endpoint daily. Pass `CRON_SECRET` as Bearer token.

## 4. Production Environment Variables
The frontend needs `VITE_CLERK_PROXY_URL` pointing to the API server's Clerk proxy path in production. In dev, the Vite proxy handles `/api` automatically.
