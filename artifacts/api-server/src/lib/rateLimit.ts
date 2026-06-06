// Simple in-memory rate limiter for AI analysis calls
// Max 30 calls per user per hour

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_CALLS = 30;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function checkRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = store.get(userId);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + WINDOW_MS;
    store.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_CALLS - 1, resetAt };
  }

  if (entry.count >= MAX_CALLS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_CALLS - entry.count,
    resetAt: entry.resetAt,
  };
}
