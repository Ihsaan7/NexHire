import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Job } from "../models/Job";
import { Profile } from "../models/Profile";
import { MatchAnalysis } from "../models/MatchAnalysis";
import { analyzeJobMatch } from "../lib/gemini";
import { checkRateLimit } from "../lib/rateLimit";
import { logger } from "../lib/logger";

const router = Router();

function formatJob(job: any, matchScore?: number) {
  return {
    id: job._id.toString(),
    source: job.source,
    title: job.title,
    company: job.company ?? null,
    location: job.location ?? null,
    sector: job.sector ?? null,
    category: job.category ?? null,
    description: job.description ?? null,
    requirements: job.requirements ?? null,
    experienceLevel: job.experienceLevel ?? null,
    jobType: job.jobType ?? null,
    salaryRange: job.salaryRange ?? null,
    postedDate: job.postedDate?.toISOString() ?? null,
    deadline: job.deadline?.toISOString() ?? null,
    applyUrl: job.applyUrl ?? null,
    applicationSteps: job.applicationSteps ?? [],
    matchScore: matchScore ?? null,
    createdAt: job.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// GET /api/jobs
router.get("/jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();

    const {
      sector,
      category,
      location,
      experienceLevel,
      jobType,
      postedWithin,
      deadlineWithin,
      minMatchScore,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    // Build $and array — all constraints compose safely
    const andClauses: any[] = [];

    // Exclude jobs older than 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    andClauses.push({
      $or: [
        { postedDate: { $gte: sixtyDaysAgo } },
        { postedDate: { $exists: false } },
      ],
    });

    // Exclude expired jobs (only if deadline is set)
    andClauses.push({
      $or: [
        { deadline: { $exists: false } },
        { deadline: { $gte: new Date() } },
      ],
    });

    const filter: Record<string, any> = { $and: andClauses };

    if (sector) filter.sector = sector;
    if (category) filter.category = category;
    if (location) filter.location = new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (experienceLevel) filter.experienceLevel = experienceLevel;
    if (jobType) filter.jobType = jobType;

    if (postedWithin) {
      const cutoff = new Date();
      if (postedWithin === "today") cutoff.setDate(cutoff.getDate() - 1);
      else if (postedWithin === "week") cutoff.setDate(cutoff.getDate() - 7);
      else if (postedWithin === "month") cutoff.setDate(cutoff.getDate() - 30);
      andClauses.push({ postedDate: { $gte: cutoff } });
    }

    if (deadlineWithin) {
      const cutoff = new Date();
      if (deadlineWithin === "3days") cutoff.setDate(cutoff.getDate() + 3);
      else if (deadlineWithin === "week") cutoff.setDate(cutoff.getDate() + 7);
      else if (deadlineWithin === "month") cutoff.setDate(cutoff.getDate() + 30);
      andClauses.push({ deadline: { $lte: cutoff } });
    }

    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      andClauses.push({
        $or: [
          { title: re },
          { company: re },
          { description: re },
          { category: re },
        ],
      });
    }

    // minMatchScore: filter by cached match analysis scores for this user
    if (minMatchScore) {
      const minScore = parseInt(minMatchScore);
      if (!isNaN(minScore) && minScore > 0) {
        const userId = (req as any).userId as string;
        const highScoreJobIds = await MatchAnalysis.find({
          userId,
          matchScore: { $gte: minScore },
        }).distinct("jobId");
        andClauses.push({ _id: { $in: highScoreJobIds } });
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ postedDate: -1, createdAt: -1 }).skip(skip).limit(limitNum),
      Job.countDocuments(filter),
    ]);

    res.json({
      jobs: jobs.map((j) => formatJob(j)),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    logger.error({ err }, "listJobs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/matched
router.get("/jobs/matched", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const limitNum = Math.min(20, parseInt((req.query.limit as string) ?? "10"));

    const profile = await Profile.findOne({ userId });

    if (!profile?.cvEmbedding?.length) {
      res.json({ jobs: [], hasCV: false });
      return;
    }

    // MongoDB $vectorSearch - requires Atlas Vector Search index named "job_embedding_index"
    try {
      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: "job_embedding_index",
            path: "embedding",
            queryVector: profile.cvEmbedding,
            numCandidates: limitNum * 5,
            limit: limitNum * 2,
          },
        },
        {
          $match: {
            $or: [
              { deadline: { $exists: false } },
              { deadline: { $gte: new Date() } },
            ],
          },
        },
        {
          $addFields: {
            vectorScore: { $meta: "vectorSearchScore" },
          },
        },
        { $limit: limitNum },
      ];

      const results = await Job.aggregate(pipeline);

      const jobs = results.map((r) => ({
        job: formatJob(r),
        matchScore: Math.round((r.vectorScore ?? 0) * 100),
      }));

      res.json({ jobs, hasCV: true });
    } catch (vectorErr: any) {
      // Vector search index may not be set up yet — fall back to recent jobs
      logger.warn(
        { err: vectorErr?.message },
        "Vector search unavailable, falling back to recent jobs",
      );
      const jobs = await Job.find({
        $or: [{ deadline: { $exists: false } }, { deadline: { $gte: new Date() } }],
      })
        .sort({ createdAt: -1 })
        .limit(limitNum);

      res.json({
        jobs: jobs.map((j) => ({ job: formatJob(j), matchScore: 0 })),
        hasCV: true,
      });
    }
  } catch (err) {
    logger.error({ err }, "getMatchedJobs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/stats
router.get("/jobs/stats", requireAuth, async (req, res) => {
  try {
    await connectMongo();

    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);

    const [total, bySector, recentCount] = await Promise.all([
      Job.countDocuments({
        $or: [{ deadline: { $exists: false } }, { deadline: { $gte: now } }],
      }),
      Job.aggregate([
        {
          $match: {
            $or: [{ deadline: { $exists: false } }, { deadline: { $gte: now } }],
          },
        },
        { $group: { _id: "$sector", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Job.countDocuments({
        $or: [{ postedDate: { $gte: weekAgo } }, { createdAt: { $gte: weekAgo } }],
      }),
    ]);

    res.json({
      total,
      bySector: bySector.map((s) => ({
        sector: s._id ?? "other",
        count: s.count,
      })),
      recentCount,
    });
  } catch (err) {
    logger.error({ err }, "getJobStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/:id
router.get("/jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const job = await Job.findById(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(formatJob(job));
  } catch (err) {
    logger.error({ err }, "getJob error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/:id/analyze
router.get("/jobs/:id/analyze", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Check cache first
    const cached = await MatchAnalysis.findOne({
      userId,
      jobId: new mongoose.Types.ObjectId(id),
    });

    if (cached) {
      res.json({
        jobId: id,
        matchScore: cached.matchScore,
        strengths: cached.strengths,
        gaps: cached.gaps,
        suggestions: cached.suggestions,
        cachedAt: cached.cachedAt.toISOString(),
      });
      return;
    }

    // Rate limit
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Rate limit exceeded. Resets at ${new Date(rateCheck.resetAt).toISOString()}`,
      });
      return;
    }

    const [profile, job] = await Promise.all([
      Profile.findOne({ userId }),
      Job.findById(id),
    ]);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (!profile?.cvText) {
      res.status(400).json({ error: "No CV uploaded yet" });
      return;
    }

    const analysis = await analyzeJobMatch(
      profile.cvText,
      job.title,
      `${job.description ?? ""}\n${job.requirements ?? ""}`,
    );

    // Cache the result
    await MatchAnalysis.findOneAndUpdate(
      { userId, jobId: new mongoose.Types.ObjectId(id as string) },
      {
        $set: {
          matchScore: analysis.matchScore,
          strengths: analysis.strengths,
          gaps: analysis.gaps,
          suggestions: analysis.suggestions,
          cachedAt: new Date(),
        },
      },
      { upsert: true },
    );

    res.json({
      jobId: id,
      matchScore: analysis.matchScore,
      strengths: analysis.strengths,
      gaps: analysis.gaps,
      suggestions: analysis.suggestions,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "analyzeJobMatch error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
