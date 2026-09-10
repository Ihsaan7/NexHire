import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Kind = "jobs" | "gigs";
type StoredSyncRecord = {
  kind: Kind;
  status?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  lastSuccessAt?: Date | null;
  message?: string | null;
  token?: string | null;
  leaseUntil?: Date | null;
};

const records: StoredSyncRecord[] = [];

function matches(record: StoredSyncRecord, query: Record<string, any>): boolean {
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!(expected as Record<string, any>[]).some((part) => matches(record, part))) return false;
      continue;
    }
    const actual = record[key as keyof StoredSyncRecord];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$ne" in expected && actual === expected.$ne) return false;
      if ("$lte" in expected && !(actual instanceof Date && actual.getTime() <= expected.$lte.getTime())) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

const fakeSyncStatusModel = {
  find(query: Record<string, any>) {
    return {
      lean: async () => records.filter((record) => matches(record, query)).map((record) => ({ ...record })),
    };
  },
  findOneAndUpdate(
    query: Record<string, any>,
    update: { $set: Partial<StoredSyncRecord>; $setOnInsert?: Partial<StoredSyncRecord> },
    options: { upsert?: boolean },
  ) {
    let record = records.find((candidate) => matches(candidate, query));
    if (!record && options.upsert) {
      // Mongo's unique kind index makes a non-matching existing lease a duplicate
      // rather than permitting a second status document.
      if (records.some((candidate) => candidate.kind === query.kind)) {
        return Promise.resolve(null);
      }
      record = { kind: query.kind as Kind };
      records.push(record);
    }
    if (!record) return Promise.resolve(null);
    Object.assign(record, update.$setOnInsert ?? {}, update.$set);
    return Promise.resolve({ ...record });
  },
  updateOne(query: Record<string, any>, update: { $set: Partial<StoredSyncRecord> }) {
    const record = records.find((candidate) => matches(candidate, query));
    if (record) Object.assign(record, update.$set);
    return Promise.resolve({ acknowledged: true, matchedCount: record ? 1 : 0 });
  },
};

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
mock.module(moduleUrl("../src/lib/mongodb.ts"), {
  namedExports: { connectMongo: async () => ({ readyState: 1 }) },
});
mock.module(moduleUrl("../src/models/SyncStatus.ts"), {
  namedExports: { SyncStatus: fakeSyncStatusModel },
});

const { SYNC_LEASE_MS, beginSync, completeSync, failSync, getSyncStatuses } =
  await import("../src/lib/syncStatus.ts");

test.beforeEach(() => {
  records.length = 0;
});

test("atomically blocks a duplicate and records successful timestamps", async () => {
  const token = await beginSync("jobs");
  assert.ok(token);
  assert.equal(await beginSync("jobs"), null);

  await completeSync("jobs", "wrong-token", "stale");
  assert.equal(records[0]?.status, "running");

  await completeSync("jobs", token, "finished");
  const statuses = await getSyncStatuses();
  assert.equal(statuses.jobs.status, "succeeded");
  assert.equal(statuses.jobs.message, "finished");
  assert.ok(statuses.jobs.completedAt);
  assert.equal(statuses.jobs.lastSuccessAt, statuses.jobs.completedAt);
});

test("expired leases are reclaimed and old workers cannot overwrite the new run", async () => {
  const oldToken = await beginSync("gigs");
  assert.ok(oldToken);
  const record = records[0]!;
  record.leaseUntil = new Date(Date.now() - 1);

  const newToken = await beginSync("gigs");
  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);
  await failSync("gigs", oldToken, "old worker");

  assert.equal(records[0]?.status, "running");
  assert.equal(records[0]?.token, newToken);
  assert.equal(records[0]?.message, "Gig sync is running.");
  assert.ok((records[0]?.leaseUntil?.getTime() ?? 0) > Date.now());
  assert.ok((records[0]?.leaseUntil?.getTime() ?? 0) <= Date.now() + SYNC_LEASE_MS + 1000);
});

test("status responses include persisted records and idle defaults", async () => {
  const token = await beginSync("jobs");
  assert.ok(token);
  const statuses = await getSyncStatuses();
  assert.equal(statuses.jobs.status, "running");
  assert.ok(statuses.jobs.startedAt);
  assert.equal(statuses.gigs.status, "idle");
  assert.equal(statuses.gigs.startedAt, null);
  assert.equal(statuses.gigs.completedAt, null);
  assert.equal(statuses.gigs.lastSuccessAt, null);
  assert.equal(statuses.gigs.message, null);
});