---
name: Gemini API key constraints
description: Which Gemini models are available with this project's API key and what dimensions the embedding model returns
---

**Embedding model:** `gemini-embedding-001` — confirmed working, returns 3072-dim vectors. `text-embedding-004` returns 404 on both v1 and v1beta for this key.

**Chat models (in order of preference):**
- `gemini-2.5-flash-lite` — has quota, use this
- `gemini-2.5-flash` — exhausted daily quota
- `gemini-2.0-flash` — exhausted daily quota (limit: 0)
- `gemini-2.0-flash-lite` — exhausted daily quota (limit: 0)

**Why:** This API key's GCP project has free-tier quotas exhausted for most models. gemini-2.5-flash-lite has its own separate bucket.

**How to apply:** Always use `gemini-2.5-flash-lite` for generateContent calls and `gemini-embedding-001` for embedContent calls. Always add 429 fallback for generateContent since quotas reset daily.
