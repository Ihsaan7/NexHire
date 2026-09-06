---
name: Practice session persistence
description: Server-side storage and reload behavior for interview practice sessions
---

Practice sessions are user-scoped Mongo records and the server is the source of truth for message history and question sequencing. The client restores the latest active or completed session through the authenticated latest-session endpoint; submitted history is retained in the contract for compatibility but persisted history drives continuation.

**Why:** React-only state was lost on navigation or reload and could let stale clients overwrite the current question sequence.

**How to apply:** Preserve session ownership checks and question-number synchronization when extending practice; do not rely on client-provided history for persistence or authorization.