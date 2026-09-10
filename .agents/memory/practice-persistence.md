---
name: Practice session persistence
description: Server-side storage and reload behavior for interview practice sessions
---

Practice sessions are user-scoped Mongo records and the server is the source of truth for message history and question sequencing. The client restores the latest active or completed session through the authenticated latest-session endpoint; submitted history is retained in the contract for compatibility but persisted history drives continuation.

**Why:** React-only state was lost on navigation or reload and could let stale clients overwrite the current question sequence.

**How to apply:** Preserve session ownership checks and question-number synchronization when extending practice; do not rely on client-provided history for persistence or authorization.

Answer evaluation must use an atomic, expiring per-question lease. Save the user's answer before calling AI, bind the final write to the lease and unchanged question number, and release only that lease on AI failure.

**Why:** Question-number checks alone allow simultaneous submissions to both call AI and overwrite or advance the same session from stale state. A permanent lock would make process crashes unrecoverable.

**How to apply:** Reject competing active leases, permit stale-lease takeover, use persisted session context for continuations, and refetch the server checkpoint after client submission errors so the answer remains retryable.

Resume decisions must wait for an authoritative post-mount session fetch rather than accepting cached query data. Starting fresh must remove the abandoned session from cache and refresh after creating its replacement.

**Why:** A one-shot hydration guard can accept a stale cached session before the network response, causing an abandoned or older completed session to replace the actual unfinished session on route remount.

**How to apply:** Gate resume/banner hydration on a fetch completed after mount, never overwrite an active practice UI, and invalidate the latest-session cache after every successful session start.