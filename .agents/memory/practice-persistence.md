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

Practice history includes successfully completed sessions, not Start fresh abandonments. Progress compares with the immediately prior completed session sharing both mode and a trimmed, case-normalized topic label.

**Why:** Abandoned sessions can contain partial scores, and comparing custom, job, and CV sessions by label alone can produce misleading progress notes. Cached history can also omit the session that just completed.

**How to apply:** Keep history/detail queries user-scoped, order deterministically, invalidate history on completion and refetch when opened, and show an improvement note only for a positive score difference.

Generate a skill category during each answer evaluation and commit it in the same lease-bound write as feedback and score. Session skill breakdowns use average score per normalized category: 8+ Strong, below 8 Needs work.

**Why:** Categorizing in a second completion pass creates another failure point and can leave finished sessions partially analyzed. Category averages avoid contradictory labels when one skill appears more than once.

**How to apply:** Keep categories open-ended, trimmed, and nullable for legacy or malformed AI output. Never infer missing legacy categories or classify unanswered/unscored questions.

Practice questions use Google Search grounding first and store citation metadata with the exact question. Only label a question as web-researched when at least one validated citation is present.

**Why:** Grounding can run searches yet return no citation chunks, and citations can disappear if question records are replaced during answer checkpointing. A plain-generation fallback must remain truthful.

**How to apply:** Ground the first and every generated follow-up question, silently retry plain Gemini on any grounded failure or zero valid sources, and preserve sources through leases, reloads, and history.