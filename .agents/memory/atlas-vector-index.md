---
name: Atlas vector search index
description: MongoDB Atlas vector search index for job CV matching
---

**Index name:** `job_embedding_index` on `jobs` collection, path `embedding`
**Dimensions:** 3072 (matches gemini-embedding-001 output)
**Similarity:** cosine
**Created via:** `db.collection('jobs').createSearchIndex({ name, type: "vectorSearch", definition: { fields: [{ type: "vector", path: "embedding", numDimensions: 3072, similarity: "cosine" }] } })`

**Why:** Atlas vector search indexes cannot be created through standard MongoDB driver methods; must use `createSearchIndex()`. Takes ~2 min to build after creation.

**How to apply:** If matched jobs return empty or fall back to recent jobs, check if index exists and is READY in Atlas. The code gracefully falls back to `Job.find().sort({createdAt:-1})` when vector search fails.
