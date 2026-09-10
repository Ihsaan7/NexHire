---
name: CV privacy deletion
description: Atomic deletion and late-writer rules for permanently removing CV-derived data
---

Permanent CV deletion must remove the current CV and every derived collection in one transaction. Any AI writer that can persist CV-derived data must conditionally bind its transaction to the exact current CV.

**Why:** Deleting existing records is insufficient when an audit, refinement, suggestion, or match analysis started earlier; an unguarded late writer can recreate private data after deletion reports success.

**How to apply:** Make derived-data writers conditionally update the exact profile CV and persist their result in the same transaction. Then deletion either removes an earlier result or wins first and forces the writer to return a conflict.