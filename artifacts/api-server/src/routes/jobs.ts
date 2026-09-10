import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Job } from "../models/Job";
import { Profile } from "../models/Profile";
import { MatchAnalysis } from "../models/MatchAnalysis";
import { analyzeJobMatch, EMBEDDING_DIMENSIONS } from "../lib/gemini";
import { logger } from "../lib/logger";
import { isDatabaseTimeoutError } from "../lib/databaseErrors";
import {
  AnalyzeJobMatchParams,
  AnalyzeJobMatchResponse,
  GetJobParams,
  GetJobResponse,
  GetJobStatsResponse,
  GetMatchedJobsQueryParams,
  GetMatchedJobsResponse,
  ListJobsQueryParams,
  ListJobsResponse,
} from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http";

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

function isUsableEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSIONS &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function findLocalVectorMatches(queryVector: number[], limit: number) {
  const candidates = await Job.find({
    embedding: { $exists: true, $ne: [] },
    $or: [{ deadline: { $exists: false } }, { deadline: { $gte: new Date() } }],
  })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  return candidates
    .filter((job) => isUsableEmbedding(job.embedding))
    .map((job) => {
      const similarity = cosineSimilarity(queryVector, job.embedding as number[]);
      return {
        job: formatJob(job),
        matchScore: Math.round(Math.max(0, Math.min(1, similarity)) * 100),
        similarity,
      };
    })
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map(({ similarity: _similarity, ...match }) => match);
}

// GET /api/jobs
router.get("/jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();

    const parsed = ListJobsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }

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
      page = 1,
      limit = 20,
    } = parsed.data;

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

    // Map frontend kebab-case sector IDs → DB display-name sector values
    const SECTOR_MAP: Record<string, string | string[]> = {
      "government":              "Government",
      "private-tech":            "Technology",
      "private-banking":         "Finance",
      "private-engineering":     "Engineering",
      "private-healthcare":      "Healthcare",
      "private-education":       "Education",
      "private-sales-marketing": ["Marketing", "Business"],
      "private-media-creative":  "Media",
      "private-operations-admin":["Human Resources", "Services", "Operations"],
      "ngo-nonprofit":           "NGO",
      "remote-international":    ["Technology", "Media", "Business"],
      "internships-fresh":       "General",
    };

    if (sector) {
      const mapped = SECTOR_MAP[sector];
      if (mapped) {
        filter.sector = Array.isArray(mapped) ? { $in: mapped } : mapped;
      } else {
        // Direct match (already a DB value like "Government")
        filter.sector = { $regex: new RegExp(sector, "i") };
      }
    }
    if (category) filter.category = { $regex: new RegExp(category.replace(/[-\/]/g, "."), "i") };
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
    if (minMatchScore !== undefined) {
      if (minMatchScore > 0) {
        const userId = (req as any).userId as string;
        const highScoreJobIds = await MatchAnalysis.find({
          userId,
          matchScore: { $gte: minMatchScore },
        }).distinct("jobId");
        andClauses.push({ _id: { $in: highScoreJobIds } });
      }
    }

    const pageNum = page;
    const limitNum = limit;
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ postedDate: -1, createdAt: -1 }).skip(skip).limit(limitNum),
      Job.countDocuments(filter),
    ]);

    res.json(ListJobsResponse.parse({
      jobs: jobs.map((j) => formatJob(j)),
      total,
      page: pageNum,
      limit: limitNum,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "listJobs error");
  }
});

// GET /api/jobs/matched
router.get("/jobs/matched", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = GetMatchedJobsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const limitNum = parsed.data.limit ?? 10;

    const profile = await Profile.findOne({ userId });

    if (!profile?.cvText) {
      res.json(GetMatchedJobsResponse.parse({ jobs: [], hasCV: false }));
      return;
    }

    if (!isUsableEmbedding(profile.cvEmbedding)) {
      logger.warn(
        { userId, dimensions: profile.cvEmbedding?.length ?? 0 },
        "CV embedding unavailable or invalid",
      );
      res.json(GetMatchedJobsResponse.parse({ jobs: [], hasCV: true }));
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

      res.json(GetMatchedJobsResponse.parse({ jobs, hasCV: true }));
    } catch (vectorErr: any) {
      if (isDatabaseTimeoutError(vectorErr)) throw vectorErr;
      logger.warn(
        { err: vectorErr?.message },
        "Vector search unavailable, falling back to local cosine scoring",
      );
      try {
        const jobs = await findLocalVectorMatches(profile.cvEmbedding, limitNum);
        res.json(GetMatchedJobsResponse.parse({ jobs, hasCV: true }));
      } catch (fallbackErr: any) {
        if (isDatabaseTimeoutError(fallbackErr)) throw fallbackErr;
        logger.error(
          { err: fallbackErr?.message },
          "Local vector fallback failed",
        );
        res.json(GetMatchedJobsResponse.parse({ jobs: [], hasCV: true }));
      }
    }
  } catch (err) {
    sendInternalServerError(req, res, err, "getMatchedJobs error");
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

    res.json(GetJobStatsResponse.parse({
      total,
      bySector: bySector.map((s) => ({
        sector: s._id ?? "other",
        count: s.count,
      })),
      recentCount,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "getJobStats error");
  }
});

// GET /api/jobs/:id
router.get("/jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const parsed = GetJobParams.safeParse(req.params);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const id = parsed.data.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const job = await Job.findById(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(GetJobResponse.parse(formatJob(job)));
  } catch (err) {
    sendInternalServerError(req, res, err, "getJob error");
  }
});

// GET /api/jobs/:id/analyze
router.get("/jobs/:id/analyze", requireAuth, async (req, res) => {
  try {
    const connection = await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = AnalyzeJobMatchParams.safeParse(req.params);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const id = parsed.data.id;

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
      res.json(AnalyzeJobMatchResponse.parse({
        jobId: id,
        matchScore: cached.matchScore,
        strengths: cached.strengths,
        gaps: cached.gaps,
        suggestions: cached.suggestions,
        cachedAt: cached.cachedAt.toISOString(),
      }));
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

    const analyzedCvText = profile.cvText;
    const analyzedCvUpdatedAt =
      profile.cvUpdatedAt ?? profile.updatedAt ?? new Date();
    const analysis = await analyzeJobMatch(
      analyzedCvText,
      job.title,
      `${job.description ?? ""}\n${job.requirements ?? ""}`,
    );

    const cachedAt = new Date();
    const session = await connection.startSession();
    let saved = false;
    try {
      const result = await session.withTransaction(async () => {
        const currentProfile = await Profile.findOneAndUpdate(
          {
            userId,
            cvText: analyzedCvText,
            ...(profile.cvUpdatedAt
              ? { cvUpdatedAt: profile.cvUpdatedAt }
              : {
                  $or: [
                    { cvUpdatedAt: { $exists: false } },
                    { cvUpdatedAt: null },
                  ],
                }),
          },
          { $set: { cvUpdatedAt: analyzedCvUpdatedAt } },
          { new: true, session },
        );
        if (!currentProfile) return false;

        await MatchAnalysis.findOneAndUpdate(
          { userId, jobId: new mongoose.Types.ObjectId(id as string) },
          {
            $set: {
              matchScore: analysis.matchScore,
              strengths: analysis.strengths,
              gaps: analysis.gaps,
              suggestions: analysis.suggestions,
              cachedAt,
            },
          },
          { upsert: true, session },
        );
        return true;
      });
      saved = result === true;
    } finally {
      await session.endSession();
    }

    if (!saved) {
      res.status(409).json({
        error:
          "The CV changed while the match analysis was running. Please try again.",
      });
      return;
    }

    res.json(AnalyzeJobMatchResponse.parse({
      jobId: id,
      matchScore: analysis.matchScore,
      strengths: analysis.strengths,
      gaps: analysis.gaps,
      suggestions: analysis.suggestions,
      cachedAt: cachedAt.toISOString(),
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "analyzeJobMatch error");
  }
});

export default router;
