---
name: CV Studio regression coverage
description: The reliable boundary for testing authenticated CV upload, audit, refinement, reload, and replacement behavior
---

CV Studio persistence regressions are best covered through the Express HTTP routes with a real PDF/DOCX multipart fixture and fresh profile reads after each mutation. Keep Clerk identity, Mongo persistence, and Gemini responses deterministic at module boundaries so the test checks route serialization and reset behavior without external services.

**Why:** The complete signed-in browser journey is not always available in this environment, while live AI and database services make regression assertions slow and nondeterministic.

**How to apply:** Assert extracted CV text, audit score/issues/strengths, and refinement job context/output from separate GET responses; upload a replacement at the end and assert both derived result objects are absent.