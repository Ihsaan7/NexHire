export function isDatabaseTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: number | string };
  return (
    candidate.code === 50 ||
    candidate.code === "50" ||
    candidate.name === "MongoServerSelectionError" ||
    candidate.name === "MongoNetworkTimeoutError" ||
    /timed out|maxTimeMS|operation exceeded time limit/i.test(candidate.message)
  );
}