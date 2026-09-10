---
name: CV refinement retention
description: Durable ordering and retention rules for saved job-specific CV refinements
---

Keep at most 10 saved refinements per user in the database, not just in API output. Order by creation time and record ID together, and serialize create-plus-prune work per user.

**Why:** Concurrent refinements can share timestamps and independent pruners can delete different records, leaving fewer than the intended newest 10.

**How to apply:** Use the same total order for indexes, list reads, and pruning. Keep users independent, refresh history after both success and saved-result conflict responses, and retain the legacy profile copy only for the unchanged CV.