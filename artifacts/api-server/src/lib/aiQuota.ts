import { connectMongo } from "./mongodb";
import { AiQuota } from "../models/AiQuota";
import { AiRateLimitError } from "./aiErrors";

const LIMIT = 30;
const HOUR = 60 * 60 * 1000;

export async function consumeAiQuota(userId: string): Promise<void> {
  await connectMongo();
  const now = new Date();
  // Reset expired windows before the atomic increment. The unique user index
  // makes this safe when several requests arrive at the same time.
  await AiQuota.updateOne(
    { userId, resetAt: { $lte: now } },
    { $set: { count: 0, resetAt: new Date(now.getTime() + HOUR) } },
  );
  let row: { count: number; resetAt: Date } | null = null;
  try {
    row = await AiQuota.findOneAndUpdate(
      { userId, resetAt: { $gt: now }, count: { $lt: LIMIT } },
      {
        $inc: { count: 1 },
        $setOnInsert: { userId, resetAt: new Date(now.getTime() + HOUR) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    ).lean();
  } catch (error: any) {
    // A concurrent first request can race on the unique index; retry it as a
    // normal atomic update rather than allowing an extra provider call.
    if (error?.code !== 11000) throw error;
    row = await AiQuota.findOneAndUpdate(
      { userId, resetAt: { $gt: now }, count: { $lt: LIMIT } },
      { $inc: { count: 1 } },
      { new: true },
    ).lean();
  }
  if (!row) {
    const current = await AiQuota.findOne({ userId }).lean();
    const resetAt = current?.resetAt ?? new Date(now.getTime() + HOUR);
    throw new AiRateLimitError(resetAt);
  }
}