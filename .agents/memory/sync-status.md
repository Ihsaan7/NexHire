---
name: Background sync status
description: Lifecycle and visibility rules for job and gig synchronization
---

Job and gig syncs share a Mongo-backed lifecycle tracker with idle, running, succeeded, and failed states. Triggers must atomically refuse duplicate concurrent runs, and the authenticated status endpoint is the UI source of truth. The Gigs page polls only while running and refreshes results after completion.

**Why:** A `202 Accepted` response only confirms startup; users previously had to guess when background work finished and manually refresh, while repeated clicks could start overlapping syncs.

**How to apply:** Use bounded leases for crash recovery and bind completion/failure to the acquiring worker token so an expired worker cannot overwrite a newer run.