---
name: Background sync status
description: Lifecycle and visibility rules for job and gig synchronization
---

Job and gig syncs share a process-local lifecycle tracker with idle, running, succeeded, and failed states. Triggers must refuse duplicate concurrent runs, and the authenticated status endpoint is the UI source of truth. The Gigs page polls only while running and refreshes results after completion.

**Why:** A `202 Accepted` response only confirms startup; users previously had to guess when background work finished and manually refresh, while repeated clicks could start overlapping syncs.

**How to apply:** Wrap every user or cron sync trigger with the shared begin/complete/fail lifecycle calls. Keep this metadata out of Mongo unless status must survive API process restarts.