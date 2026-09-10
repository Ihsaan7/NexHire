import { Router } from "express";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Gig } from "../models/Gig";
import { getUsdToPkr, calcValueScore } from "../lib/exchangeRate";
import { logger } from "../lib/logger";
import { AiRateLimitError } from "../lib/aiErrors";
import { runGigSync } from "./sync-gigs";
import { ListGigsQueryParams, ListGigsResponse } from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http";
import { beginSync, completeSync, failSync } from "../lib/syncStatus";

const router = Router();

function formatGig(g: any, usdToPkr: number) {
  const { estMonthlyPKR, valueScore, isRecurring } = calcValueScore(
    g.estPayUSD,
    g.payModel,
    g.difficulty,
    usdToPkr,
  );

  let valueIndicator: "high" | "good" | "low" | null = null;
  if (valueScore !== null) {
    if (valueScore >= 80000) valueIndicator = "high";
    else if (valueScore >= 40000) valueIndicator = "good";
    else valueIndicator = "low";
  }

  return {
    id: g._id.toString(),
    source: g.source,
    title: g.title,
    company: g.company ?? null,
    description: g.description ?? null,
    applyUrl: g.applyUrl ?? null,
    postedDate: g.postedDate?.toISOString() ?? null,
    taskType: g.taskType ?? null,
    payModel: g.payModel ?? null,
    estPayUSD: g.estPayUSD ?? null,
    difficulty: g.difficulty ?? null,
    legitScore: g.legitScore ?? null,
    redFlags: g.redFlags ?? [],
    enrichedAt: g.enrichedAt?.toISOString() ?? null,
    estMonthlyPKR: estMonthlyPKR ? Math.round(estMonthlyPKR) : null,
    valueScore: valueScore ? Math.round(valueScore) : null,
    valueIndicator,
    isRecurring,
    createdAt: g.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// POST /api/gigs/sync — Clerk-auth protected, triggers gig sync in background
router.post("/gigs/sync", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const syncToken = await beginSync("gigs");
  if (!syncToken) {
    res.status(202).json({ message: "Sync already in progress. Check back shortly." });
    return;
  }

  res.status(202).json({ message: "Gig sync started." });
  (async () => {
    try {
      const { total } = await runGigSync(userId);
      await completeSync("gigs", syncToken, `Gig sync completed. ${total} gigs are available.`);
    } catch (err) {
      const message =
        err instanceof AiRateLimitError
          ? `AI limit reached. Try again in ${Math.max(
              1,
              Math.ceil(
                (new Date(err.resetAt).getTime() - Date.now()) / 60_000,
              ),
            )} minutes. Reset at ${err.resetAt}.`
          : "Gig sync failed. Try again.";
      await failSync("gigs", syncToken, message);
      logger.error({ err }, "gigs/sync background error");
    }
  })();
});

// GET /api/gigs
router.get("/gigs", requireAuth, async (req, res) => {
  try {
    await connectMongo();

    const parsed = ListGigsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }

    const {
      taskType,
      payModel,
      difficulty,
      minLegitScore,
      showLowTrust,
      sort = "value",
      page = 1,
      limit = 20,
    } = parsed.data;

    const pageNum = page;
    const limitNum = limit;

    const filter: Record<string, any> = {};

    // Default: hide gigs with legitScore < 60
    const trustThreshold = showLowTrust === "true" ? 0 : 60;
    filter.$or = [
      { legitScore: { $gte: trustThreshold } },
      { legitScore: { $exists: false } },
    ];

    if (minLegitScore) {
      filter.legitScore = { $gte: minLegitScore };
    }

    // Prune gigs older than 45 days
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    filter.createdAt = { $gte: fortyFiveDaysAgo };

    if (taskType) filter.taskType = taskType;
    if (payModel) filter.payModel = payModel;
    if (difficulty) filter.difficulty = difficulty;

    const usdToPkr = await getUsdToPkr();

    let gigs: any[];
    const total = await Gig.countDocuments(filter);

    if (sort === "value") {
      // For value sort we need to compute in-app since it's derived
      gigs = await Gig.find(filter)
        .sort({ legitScore: -1, createdAt: -1 })
        .lean();

      gigs = gigs
        .map((g) => formatGig(g, usdToPkr))
        .sort((a, b) => {
          if (a.valueScore === null && b.valueScore === null) return (b.legitScore ?? 0) - (a.legitScore ?? 0);
          if (a.valueScore === null) return 1;
          if (b.valueScore === null) return -1;
          if (b.valueScore !== a.valueScore) return b.valueScore - a.valueScore;
          return (b.legitScore ?? 0) - (a.legitScore ?? 0);
        })
        .slice((pageNum - 1) * limitNum, pageNum * limitNum);
    } else {
      const mongoSort: Record<string, 1 | -1> =
        sort === "newest" ? { createdAt: -1 }
        : sort === "pay" ? { estPayUSD: -1 }
        : sort === "legit" ? { legitScore: -1 }
        : { createdAt: -1 };

      gigs = await Gig.find(filter)
        .sort(mongoSort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();

      gigs = gigs.map((g) => formatGig(g, usdToPkr));
    }

    const usdRate = usdToPkr;

    res.json(ListGigsResponse.parse({ gigs, total, page: pageNum, limit: limitNum, usdToPkr: usdRate }));
  } catch (err) {
    sendInternalServerError(req, res, err, "listGigs error");
  }
});

export default router;
