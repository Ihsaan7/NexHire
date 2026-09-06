---
name: API validation and generated schemas
description: OpenAPI-derived validation rules and runtime schema availability in this monorepo
---

Use `lib/api-spec/openapi.yaml` for boundary constraints, then regenerate before consuming the generated Zod or React Query types. Generated output can expose some response models as TypeScript-only types rather than runtime parsers, so confirm the generated export before calling `.parse()`; keep simple typed response shapes unchanged when no runtime schema exists.

**Why:** Tightening the contract exposed stringly typed UI filters and invalid pagination values, while assuming every generated model had a runtime validator caused avoidable server type errors.

**How to apply:** When adding validation, update the OpenAPI constraint first, run codegen, check both generated barrels, then fix UI control boundaries with explicit narrowing rather than weakening the contract.