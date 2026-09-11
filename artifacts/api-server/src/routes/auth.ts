import { Router } from "express";
import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { runWithAiUser } from "../lib/aiContext.js";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  runWithAiUser(userId, next);
};

const router = Router();
export default router;
