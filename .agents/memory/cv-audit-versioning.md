---
name: CV audit version isolation
description: Persistence and cache rules that keep saved audits attached to the correct CV and user
---

Persist every audit in the explicit `cvAudits` collection and bind it internally to the exact CV update timestamp. Latest-audit reads must match both user and CV version; a late audit must never attach to a replacement CV.

Quick suggestions also belong to the exact user/CV version in `cvAudits`. Restore saved suggestions before calling AI, and single-flight concurrent generation requests so one CV produces one shared result and timestamp.

**Why:** AI can finish after a user replaces their CV, concurrent page loads can duplicate paid generation, and unscoped client caches can briefly expose another signed-in user's profile during account switching.

**How to apply:** Establish a stable CV timestamp for legacy profiles, condition writes on an unchanged snapshot, key queries by user/CV version, single-flight generation, and remount the QueryClient when Clerk identity changes.