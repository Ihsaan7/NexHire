---
name: Job data sources
description: What job APIs work for Pakistani job aggregator and which don't
---

**Adzuna:** Does NOT support Pakistan (`pk`). Returns `UNSUPPORTED_COUNTRY`. Supported list: at, au, be, br, ca, ch, de, es, fr, gb, in, it, mx, nl, nz, pl, sg, us, za.

**Working sources (free, no auth):**
- Remotive: `https://remotive.com/api/remote-jobs?category={cat}&limit=50` — remote tech jobs, returns `category` as display name (e.g. "Software Development"), NOT slug
- Arbeitnow: `https://www.arbeitnow.com/api/job-board-api?page={n}` — filter `remote: true` for relevant jobs

**Why:** Pakistani professionals can apply to remote international jobs. Date filter must be 60-day window (not hardcoded 2026-01-01).

**How to apply:** The cron endpoint is still named `/api/cron/sync-adzuna` for backward compat but internally uses Remotive + Arbeitnow.
