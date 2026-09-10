---
name: CV audit version isolation
description: Persistence and cache rules that keep saved audits attached to the correct CV and user
---

Persist every audit in the explicit `cvAudits` collection and bind it internally to the exact CV update timestamp. Latest-audit reads must match both user and CV version; a late audit must never attach to a replacement CV.

**Why:** AI can finish after a user replaces their CV, and unscoped client caches can briefly expose another signed-in user's profile during account switching.

**How to apply:** Condition legacy profile writes on the unchanged CV snapshot, key audit queries by user and CV version, and remount the QueryClient synchronously when Clerk identity changes.