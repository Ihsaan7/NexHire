import { Router } from "express";
import { GetSyncStatusResponse } from "@workspace/api-zod";
import { getSyncStatuses } from "../lib/syncStatus";
import { requireAuth } from "./auth";

const router = Router();

router.get("/sync/status", requireAuth, (_req, res) => {
  res.json(GetSyncStatusResponse.parse(getSyncStatuses()));
});

export default router;