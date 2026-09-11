import { randomUUID } from "node:crypto";
import { connectMongo } from "./mongodb.js";
import { SyncStatus as SyncStatusModel } from "../models/SyncStatus.js";

export type SyncKind = "jobs" | "gigs";
export type SyncState = "idle" | "running" | "succeeded" | "failed";

export type SyncStatus = {
  status: SyncState;
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessAt: string | null;
  message: string | null;
};

// Long enough for normal syncs, but bounded so a crashed worker is recoverable.
export const SYNC_LEASE_MS = 60 * 60 * 1000;

export async function getSyncStatuses(): Promise<Record<SyncKind, SyncStatus>> {
  await connectMongo();
  const records = await SyncStatusModel.find({ kind: { $in: ["jobs", "gigs"] } }).lean();
  const idle = (): SyncStatus => ({
    status: "idle", startedAt: null, completedAt: null, lastSuccessAt: null, message: null,
  });
  const result: Record<SyncKind, SyncStatus> = { jobs: idle(), gigs: idle() };
  for (const record of records) {
    result[record.kind as SyncKind] = {
      status: record.status,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      lastSuccessAt: record.lastSuccessAt?.toISOString() ?? null,
      message: record.message ?? null,
    };
  }
  return result;
}

/** Atomically claims a kind; returns a worker token, or null when leased by another worker. */
export async function beginSync(kind: SyncKind): Promise<string | null> {
  await connectMongo();
  const now = new Date();
  const token = randomUUID();
  try {
    const claimed = await SyncStatusModel.findOneAndUpdate(
      { kind, $or: [{ status: { $ne: "running" } }, { leaseUntil: { $lte: now } }] },
      {
        $set: {
          status: "running", startedAt: now, completedAt: null,
          message: `${kind === "jobs" ? "Job" : "Gig"} sync is running.`,
          token, leaseUntil: new Date(now.getTime() + SYNC_LEASE_MS),
        },
        $setOnInsert: { kind },
      },
      { upsert: true, new: true },
    );
    return claimed ? token : null;
  } catch (error: any) {
    // Concurrent upserts can race on the unique kind index; the loser is a duplicate.
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function completeSync(kind: SyncKind, token: string, message: string): Promise<void> {
  await connectMongo();
  const completedAt = new Date();
  await SyncStatusModel.updateOne(
    { kind, token, status: "running" },
    { $set: { status: "succeeded", completedAt, lastSuccessAt: completedAt, message, leaseUntil: null, token: null } },
  );
}

export async function failSync(kind: SyncKind, token: string, message: string): Promise<void> {
  await connectMongo();
  await SyncStatusModel.updateOne(
    { kind, token, status: "running" },
    { $set: { status: "failed", completedAt: new Date(), message, leaseUntil: null, token: null } },
  );
}
