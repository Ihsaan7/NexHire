import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isMongoReady } from "../lib/mongodb";
import { getSyncStatuses } from "../lib/syncStatus";

const router: IRouter = Router();

async function healthCheck(_req: unknown, res: any) {
  if (!isMongoReady()) {
    res.status(503).json({ error: "Service temporarily unavailable" });
    return;
  }
  const statuses = await getSyncStatuses();
  const successfulSyncs = [
    statuses.jobs.lastSuccessAt,
    statuses.gigs.lastSuccessAt,
  ].filter((value): value is string => Boolean(value));
  const lastSync =
    successfulSyncs.sort((left, right) => right.localeCompare(left))[0] ?? null;
  const data = HealthCheckResponse.parse({
    status: "ok",
    db: "connected",
    lastSync,
    version: "1.0.0",
  });
  res.json(data);
}

router.get("/health", healthCheck);
router.get("/healthz", healthCheck);

export default router;
