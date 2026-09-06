---
name: Onboarding completion
description: How first-run setup completion is inferred without adding profile state
---

Treat onboarding as complete when the profile has a non-empty experience level and at least one target sector. CV upload remains optional. Gate authenticated product routes on this server-backed profile state rather than browser storage.

**Why:** These preferences are the minimum useful input for relevant job discovery, already persist in the profile, and avoid a database migration or a client-only flag that can become stale.

**How to apply:** New authenticated routes should use the shared completion predicate. Changes to required onboarding inputs must update the predicate and onboarding form together.