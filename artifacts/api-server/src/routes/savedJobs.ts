import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "./auth.js";
import { connectMongo } from "../lib/mongodb.js";
import { SavedJob } from "../models/SavedJob.js";
import { Job } from "../models/Job.js";
import {
  DeleteSavedJobParams,
  ListSavedJobsResponse,
  SaveJobBody,
  UpdateSavedJobBody,
  UpdateSavedJobParams,
  UpdateSavedJobResponse,
} from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http.js";

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

// Safely extract the jobId string regardless of whether jobId is populated or not
function resolveJobId(jobIdField: any): string {
  if (!jobIdField) return "";
  // Populated doc has ._id; raw ObjectId has .toString()
  if (typeof jobIdField === "object" && jobIdField._id) {
    return jobIdField._id.toString();
  }
  return jobIdField.toString();
}

// GET /api/saved-jobs
router.get("/saved-jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;

    const savedJobs = await SavedJob.find({ userId })
      .populate("jobId")
      .sort({ createdAt: -1 });

    res.json(ListSavedJobsResponse.parse(
      savedJobs.map((s) => ({
        id: s._id.toString(),
        userId: s.userId,
        jobId: resolveJobId(s.jobId),
        job:
          s.jobId && typeof s.jobId === "object" && (s.jobId as any)._id
            ? formatJob(s.jobId)
            : undefined,
        status: s.status,
        notes: s.notes ?? null,
        appliedAt: s.appliedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    ));
  } catch (err) {
    sendInternalServerError(req, res, err, "listSavedJobs error");
  }
});

// POST /api/saved-jobs
router.post("/saved-jobs", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = SaveJobBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const { jobId, status = "saved", notes } = parsed.data;

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

    res.status(201).json(UpdateSavedJobResponse.parse({
      id: saved._id.toString(),
      userId: saved.userId,
      jobId: saved.jobId.toString(),
      job: formatJob(job),
      status: saved.status,
      notes: saved.notes ?? null,
      appliedAt: saved.appliedAt?.toISOString() ?? null,
      createdAt: saved.createdAt.toISOString(),
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "saveJob error");
  }
});

// PATCH /api/saved-jobs/:id
router.patch("/saved-jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const params = UpdateSavedJobParams.safeParse(req.params);
    if (!params.success) {
      sendValidationError(req, res, params.error);
      return;
    }
    const parsed = UpdateSavedJobBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const id = params.data.id;
    const { status, notes, appliedAt } = parsed.data;

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

    res.json(UpdateSavedJobResponse.parse({
      id: saved._id.toString(),
      userId: saved.userId,
      jobId: resolveJobId(saved.jobId),
      job:
        saved.jobId && typeof saved.jobId === "object" && (saved.jobId as any)._id
          ? formatJob(saved.jobId)
          : undefined,
      status: saved.status,
      notes: saved.notes ?? null,
      appliedAt: saved.appliedAt?.toISOString() ?? null,
      createdAt: saved.createdAt.toISOString(),
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "updateSavedJob error");
  }
});

// DELETE /api/saved-jobs/:id
router.delete("/saved-jobs/:id", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const params = DeleteSavedJobParams.safeParse(req.params);
    if (!params.success) {
      sendValidationError(req, res, params.error);
      return;
    }
    const id = params.data.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await SavedJob.findOneAndDelete({ _id: id, userId });
    res.status(204).send();
  } catch (err) {
    sendInternalServerError(req, res, err, "deleteSavedJob error");
  }
});

export default router;
