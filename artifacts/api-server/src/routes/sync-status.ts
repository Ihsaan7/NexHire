import { Router } from "express";
import { GetSyncStatusResponse } from "@workspace/api-zod";
import { getSyncStatuses } from "../lib/syncStatus.js";
import { requireAuth } from "./auth.js";

const router = Router();

router.get("/sync/status", requireAuth, async (_req, res) => {
  res.json(GetSyncStatusResponse.parse(await getSyncStatuses()));
});

export default router;