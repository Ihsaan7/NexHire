import { Router } from "express";
import multer from "multer";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { CvAudit } from "../models/CvAudit";
import { generateEmbedding, generateCvSuggestions, auditCvPakistan, refineCvForJob } from "../lib/gemini";
import { logger } from "../lib/logger";
import {
  AuditCvResponse,
  GetLatestCvAuditResponse,
  GetCvSuggestionsResponse,
  GetProfileResponse,
  RefineCvBody,
  RefineCvResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  UploadCvResponse,
} from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http";

// Use memory storage — never write CV to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed"));
    }
  },
});

const router = Router();

function formatCvAuditRecord(audit: any) {
  return {
    id: audit._id.toString(),
    auditResult: audit.auditResult,
    createdAt: audit.createdAt.toISOString(),
  };
}

function formatPersistedDate(value: unknown, fallback: Date): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }

  return fallback.toISOString();
}

function formatProfile(profile: any) {
  const fallbackGeneratedAt =
    profile.cvUpdatedAt instanceof Date ? profile.cvUpdatedAt : profile.updatedAt;
  const hasSavedAudit =
    Number.isFinite(profile.cvAudit?.score) &&
    Array.isArray(profile.cvAudit?.issues) &&
    Array.isArray(profile.cvAudit?.strengths);
  const hasSavedRefinement =
    typeof profile.cvRefinement?.refinedCv === "string" &&
    Array.isArray(profile.cvRefinement?.changes);

  return GetProfileResponse.parse({
    id: profile._id.toString(),
    userId: profile.userId,
    cvText: profile.cvText ?? null,
    cvUpdatedAt: profile.cvUpdatedAt?.toISOString() ?? null,
    cvAudit: hasSavedAudit
      ? {
          score: profile.cvAudit.score,
          issues: profile.cvAudit.issues,
          strengths: profile.cvAudit.strengths,
          generatedAt: formatPersistedDate(
            profile.cvAudit.generatedAt,
            fallbackGeneratedAt,
          ),
        }
      : undefined,
    cvRefinement: hasSavedRefinement
      ? {
          jobTitle: profile.cvRefinement.jobTitle ?? null,
          jobDescription: profile.cvRefinement.jobDescription ?? "",
          refinedCv: profile.cvRefinement.refinedCv,
          changes: profile.cvRefinement.changes,
          generatedAt: formatPersistedDate(
            profile.cvRefinement.generatedAt,
            fallbackGeneratedAt,
          ),
        }
      : undefined,
    preferences: profile.preferences,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
}

// GET /api/profile
router.get("/profile", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    let profile = await Profile.findOne({ userId });

    if (!profile) {
      // Auto-create empty profile on first access
      profile = await Profile.create({ userId });
    }

    res.json(formatProfile(profile));
  } catch (err) {
    sendInternalServerError(req, res, err, "getProfile error");
  }
});

// PATCH /api/profile
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = UpdateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const { preferences } = parsed.data;

    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: { preferences } },
      { new: true, upsert: true },
    );

    res.json(UpdateProfileResponse.parse(formatProfile(profile)));
  } catch (err) {
    sendInternalServerError(req, res, err, "updateProfile error");
  }
});

// POST /api/profile/cv
router.post(
  "/profile/cv",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      await connectMongo();
      const userId = (req as any).userId as string;

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      let cvText = "";
      const mime = req.file.mimetype;

      if (mime === "application/pdf") {
        const { extractText } = await import("unpdf");
        const result = await extractText(new Uint8Array(req.file.buffer), { mergePages: true });
        cvText = result.text;
      } else {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        cvText = result.value;
      }

      if (!cvText.trim()) {
        res.status(400).json({ error: "Could not extract text from CV" });
        return;
      }

      // Generate embedding
      const cvEmbedding = await generateEmbedding(cvText.slice(0, 8000));
      const cvUpdatedAt = new Date();

      await Profile.findOneAndUpdate(
        { userId },
        {
          $set: { cvText, cvEmbedding, cvUpdatedAt },
          $unset: { cvAudit: 1, cvRefinement: 1 },
        },
        { upsert: true },
      );

      // Do NOT log cvText
      logger.info({ userId, cvTextLength: cvText.length }, "CV uploaded");

      res.json(UploadCvResponse.parse({
        success: true,
        cvTextLength: cvText.length,
        cvUpdatedAt: cvUpdatedAt.toISOString(),
      }));
    } catch (err) {
      sendInternalServerError(req, res, err, "uploadCv error");
    }
  },
);

// POST /api/profile/cv/audit
router.get("/profile/cv/audit", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const profile = await Profile.findOne({ userId });

    if (!profile?.cvUpdatedAt) {
      res.json(GetLatestCvAuditResponse.parse({ audit: null }));
      return;
    }

    const audit = await CvAudit.findOne({
      userId,
      cvUpdatedAt: profile.cvUpdatedAt,
    }).sort({ createdAt: -1 });

    res.json(
      GetLatestCvAuditResponse.parse({
        audit: audit ? formatCvAuditRecord(audit) : null,
      }),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "getLatestCvAudit error");
  }
});

router.post("/profile/cv/audit", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const profile = await Profile.findOne({ userId });
    if (!profile?.cvText) {
      res.status(400).json({ error: "No CV uploaded yet" });
      return;
    }
    const audit = await auditCvPakistan(profile.cvText);
    const generatedAt = new Date();
    const auditedCvUpdatedAt =
      profile.cvUpdatedAt ?? profile.updatedAt ?? generatedAt;
    await CvAudit.create({
      userId,
      cvUpdatedAt: auditedCvUpdatedAt,
      auditResult: audit,
      createdAt: generatedAt,
    });
    const currentProfile = await Profile.findOneAndUpdate(
      {
        userId,
        cvText: profile.cvText,
        ...(profile.cvUpdatedAt
          ? { cvUpdatedAt: profile.cvUpdatedAt }
          : {
              $or: [
                { cvUpdatedAt: { $exists: false } },
                { cvUpdatedAt: null },
              ],
            }),
      },
      {
        $set: {
          cvUpdatedAt: auditedCvUpdatedAt,
          cvAudit: { ...audit, generatedAt },
        },
      },
      { new: true },
    );
    if (!currentProfile) {
      res.status(409).json({
        error: "The CV changed while the audit was running. Please re-analyse it.",
      });
      return;
    }
    res.json(AuditCvResponse.parse(audit));
  } catch (err) {
    sendInternalServerError(req, res, err, "cvAudit error");
  }
});

// POST /api/profile/cv/refine
router.post("/profile/cv/refine", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = RefineCvBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const { jobTitle, jobDescription } = parsed.data;
    if (!jobDescription?.trim()) {
      res.status(400).json({ error: "jobDescription is required" });
      return;
    }
    const profile = await Profile.findOne({ userId });
    if (!profile?.cvText) {
      res.status(400).json({ error: "No CV uploaded yet" });
      return;
    }
    const result = await refineCvForJob(profile.cvText, jobTitle || "the role", jobDescription);
    await Profile.updateOne(
      { userId },
      {
        $set: {
          cvRefinement: {
            ...result,
            jobTitle: jobTitle || null,
            jobDescription,
            generatedAt: new Date(),
          },
        },
      },
    );
    res.json(RefineCvResponse.parse(result));
  } catch (err) {
    sendInternalServerError(req, res, err, "cvRefine error");
  }
});

// GET /api/profile/cv/suggestions
router.get("/profile/cv/suggestions", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const profile = await Profile.findOne({ userId });

    if (!profile?.cvText) {
      res.status(400).json({ error: "No CV uploaded yet" });
      return;
    }

    const suggestions = await generateCvSuggestions(profile.cvText);

    res.json(GetCvSuggestionsResponse.parse({
      suggestions,
      generatedAt: new Date().toISOString(),
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "getCvSuggestions error");
  }
});

export default router;
