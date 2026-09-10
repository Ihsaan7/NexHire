import assert from "node:assert/strict";
import { mock, test } from "node:test";

type QuotaState = { userId: string; count: number; resetAt: Date };
let state: QuotaState | null = null;

const chain = <T>(value: T) => ({ lean: async () => value });
const fakeAiQuota = {
  async updateOne(query: any, update: any) {
    if (
      state &&
      state.userId === query.userId &&
      state.resetAt <= query.resetAt.$lte
    ) {
      state.count = update.$set.count;
      state.resetAt = update.$set.resetAt;
    }
  },
  findOneAndUpdate(query: any, update: any) {
    if (!state) {
      state = {
        userId: query.userId,
        count: update.$inc.count,
        resetAt: update.$setOnInsert.resetAt,
      };
      return chain({ ...state });
    }
    if (
      state.userId === query.userId &&
      state.resetAt > query.resetAt.$gt &&
      state.count < query.count.$lt
    ) {
      state.count += update.$inc.count;
      return chain({ ...state });
    }
    return chain(null);
  },
  findOne(query: any) {
    return chain(state?.userId === query.userId ? { ...state } : null);
  },
};

const moduleUrl = (relativePath: string) =>
  new URL(relativePath, import.meta.url).href;
mock.module(moduleUrl("../src/lib/mongodb.ts"), {
  namedExports: { connectMongo: async () => undefined },
});
mock.module(moduleUrl("../src/models/AiQuota.ts"), {
  namedExports: { AiQuota: fakeAiQuota },
});

const { consumeAiQuota } = await import("../src/lib/aiQuota.ts");
const { AiRateLimitError } = await import("../src/lib/aiErrors.ts");
const { callGemini } = await import("../src/lib/gemini.ts");

test("allows 30 calls, blocks the 31st, and resets an expired window", async () => {
  state = null;
  for (let index = 0; index < 30; index += 1) {
    await consumeAiQuota("user-1");
  }
  assert.equal(state?.count, 30);
  await assert.rejects(consumeAiQuota("user-1"), AiRateLimitError);

  assert.ok(state);
  state.resetAt = new Date(Date.now() - 1);
  await consumeAiQuota("user-1");
  assert.equal(state.count, 1);
  assert.ok(state.resetAt.getTime() > Date.now());
});

test("explicit authenticated background calls consume the same quota", async () => {
  state = null;
  const result = await callGemini(
    async () => "enriched",
    100,
    "manual-sync-user",
  );
  assert.equal(result, "enriched");
  assert.equal(state?.userId, "manual-sync-user");
  assert.equal(state?.count, 1);
});