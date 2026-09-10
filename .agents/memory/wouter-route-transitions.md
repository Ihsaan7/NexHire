---
name: Wouter route transition boundaries
description: Preventing stale or blank route content during browser history navigation
---

Do not wrap Wouter's keyed `Switch` itself in `AnimatePresence mode="wait"`. Keep route remounting keyed by the live Wouter location, and render an explicit auth-loading state on routes whose content depends on Clerk resolution.

**Why:** The animation boundary retained the old route tree during browser history changes, while implicit Clerk `Show` branches could leave the root viewport empty during auth resolution.

**How to apply:** Put optional motion inside concrete page/layout content, not around the router switch. Verify forward, Back, Forward, and rapid history changes whenever route-level transitions change.