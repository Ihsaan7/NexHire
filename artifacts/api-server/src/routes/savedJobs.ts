import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { SavedJob } from "../models/SavedJob";
import { Job } from "../models/Job";
import { logger } from "../lib/logger";

const router = Router();

function formatJob(job: any) {
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
    matchScore: null,
    createdAt: job.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// GET /api/saved-jobs
router.get("/saved-jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;

    const savedJobs = await SavedJob.find({ userId })
      .populate("jobId")
      .sort({ createdAt: -1 });

    res.json(
      savedJobs.map((s) => ({
        id: s._id.toString(),
        userId: s.userId,
        jobId: s.jobId.toString(),
        job: s.jobId && typeof s.jobId === "object" ? formatJob(s.jobId) : null,
        status: s.status,
        notes: s.notes ?? null,
        appliedAt: s.appliedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    logger.error({ err }, "listSavedJobs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/saved-jobs
router.post("/saved-jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const { jobId, status = "saved", notes } = req.body;

    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      res.status(400).json({ error: "Invalid jobId" });
      return;
    }

    const job = await Job.findById(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const saved = await SavedJob.findOneAndUpdate(
      { userId, jobId: new mongoose.Types.ObjectId(jobId) },
      { $set: { status, notes } },
      { new: true, upsert: true },
    );

    res.status(201).json({
      id: saved._id.toString(),
      userId: saved.userId,
      jobId: saved.jobId.toString(),
      job: formatJob(job),
      status: saved.status,
      notes: saved.notes ?? null,
      appliedAt: saved.appliedAt?.toISOString() ?? null,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "saveJob error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/saved-jobs/:id
router.patch("/saved-jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const id = req.params.id as string;
    const { status, notes, appliedAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const update: Record<string, any> = {};
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = notes;
    if (appliedAt !== undefined) update.appliedAt = new Date(appliedAt);

    const saved = await SavedJob.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true },
    ).populate("jobId");

    if (!saved) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id: saved._id.toString(),
      userId: saved.userId,
      jobId: saved.jobId.toString(),
      job:
        saved.jobId && typeof saved.jobId === "object"
          ? formatJob(saved.jobId)
          : null,
      status: saved.status,
      notes: saved.notes ?? null,
      appliedAt: saved.appliedAt?.toISOString() ?? null,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "updateSavedJob error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/saved-jobs/:id
router.delete("/saved-jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await SavedJob.findOneAndDelete({ _id: id, userId });
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "deleteSavedJob error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
