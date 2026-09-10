---
name: Production hardening boundaries
description: Durable rules for AI quotas, provider deadlines, database readiness, and production origins
---

Count AI limits at the provider-call boundary with durable per-user storage, not at individual routes. Grounded generation and its fallback are separate calls.

**Why:** Route counters drift across replicas, count cache hits incorrectly, and miss indirect provider calls.

**How to apply:** Propagate the authenticated user through request context, reserve quota immediately before each provider call, and keep background cron work outside per-user limits.

Provider and database deadlines must retain typed timeout errors until the shared HTTP mapper returns a friendly 504.

**Why:** Broad fallback catches can turn operational timeouts into empty or misleading successful responses.

**How to apply:** Re-throw typed timeout errors before optional fallbacks; use database readiness gating and refuse startup when required configuration is absent.

Production CORS must use an explicit HTTPS origin rather than deriving a development domain.

**Why:** Replit development domains are not published production URLs, and permissive reflection defeats origin restriction.

**How to apply:** Require the production origin in production configuration; allow only loopback origins during development.