---
name: CV version transactions
description: Atomicity and retention rules for replacing and restoring current CVs
---

Treat CV replacement and restore as a transactional history swap. Archive the displaced current CV, update the profile, remove a promoted history record when restoring, and prune to five within one MongoDB transaction.

**Why:** Partial multi-document writes can report failure after changing the current CV, create duplicate archives on retry, and eventually prune unique versions.

**How to apply:** Generate embeddings before opening the transaction, serialize same-user mutations, order by upload time plus record ID, throw conflicts to abort, and refresh profile plus history after client errors.