---
name: Job data sources
description: What job APIs work for NexHire and which don't
---

**Adzuna:** Does NOT support Pakistan (`pk`). Returns `UNSUPPORTED_COUNTRY`.

**Working sources:**
1. **LinkedIn Guest API (PRIMARY - Pakistani local jobs):** `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location=Pakistan&start={n}` — no auth, returns HTML parsed with cheerio. Returns real Pakistani office jobs (Karachi, Lahore, Islamabad). Use `User-Agent: Chrome/124`. Job IDs from `data-entity-urn`. 19 keyword searches × 2 pages = ~246 jobs.
2. **Remotive:** `https://remotive.com/api/remote-jobs?category={cat}&limit=50` — remote international tech jobs. `category` field is display name like "Software Development" (NOT a slug).
3. **Arbeitnow:** `https://www.arbeitnow.com/api/job-board-api?page={n}` — filter `remote: true`. Categories from job title via `mapTitleToCategory()`.

**Sync pattern:** Respond 202 immediately, run in background IIFE — sync takes 3-5 min due to LinkedIn rate-limit delays (600ms/page, 1200ms/keyword) and Gemini embedding generation.

**Category mapping:** `mapTitleToCategory(title, tags)` — maps from job title keywords. Covers: Government, Finance & Banking, Education, Healthcare, Engineering, Software Dev, Data & AI, etc.

**Why LinkedIn timeout was fixed:** Made cron endpoint fire-and-forget (respond 202, run IIFE) — the sync takes 3-5 min total which exceeds any reasonable HTTP timeout.

**Result:** 309 jobs total (246 LinkedIn PK + 63 international remote), 191 with 3072-dim embeddings.
