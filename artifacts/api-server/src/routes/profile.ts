import { Router } from "express";
import multer from "multer";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { CvAudit } from "../models/CvAudit";
import { CvRefinement } from "../models/CvRefinement";
import { CvVersion } from "../models/CvVersion";
import { generateEmbedding, generateCvSuggestions, auditCvPakistan, refineCvForJob } from "../lib/gemini";
import { logger } from "../lib/logger";
import {
  AuditCvResponse,
  GetLatestCvAuditResponse,
  GetCvRefinementsResponse,
  GetCvVersionsResponse,
  GetCvSuggestionsResponse,
  GetProfileResponse,
  RefineCvBody,
  RefineCvResponse,
  RestoreCvVersionResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  UploadCvResponse,
} from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http";
import type { ClientSession, Connection } from "mongoose";

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

type SuggestionGenerationOutcome =
  | { ok: true; suggestions: string[]; generatedAt: Date }
  | { ok: false };

const suggestionFlights = new Map<
  string,
  Promise<SuggestionGenerationOutcome>
>();
const refinementWriteTails = new Map<string, Promise<void>>();
const cvMutationTails = new Map<string, Promise<void>>();

class CvMutationConflictError extends Error {}

async function serializeRefinementWrite<T>(
  userId: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = refinementWriteTails.get(userId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(write);
  const tail = operation.then(
    () => undefined,
    () => undefined,
  );
  refinementWriteTails.set(userId, tail);

  try {
    return await operation;
  } finally {
    if (refinementWriteTails.get(userId) === tail) {
      refinementWriteTails.delete(userId);
    }
  }
}

async function serializeCvMutation<T>(
  userId: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = cvMutationTails.get(userId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(write);
  const tail = operation.then(
    () => undefined,
    () => undefined,
  );
  cvMutationTails.set(userId, tail);

  try {
    return await operation;
  } finally {
    if (cvMutationTails.get(userId) === tail) {
      cvMutationTails.delete(userId);
    }
  }
}

async function runInTransaction<T>(
  connection: Connection,
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    const result = await session.withTransaction(() => operation(session));
    if (result === undefined) {
      throw new Error("CV transaction completed without a result");
    }
    return result;
  } finally {
    await session.endSession();
  }
}

async function pruneCvVersions(userId: string, session: ClientSession) {
  const staleVersions = await CvVersion.find({ userId }, null, { session })
    .sort({ uploadedAt: -1, _id: -1 })
    .skip(5)
    .select({ _id: 1 });
  if (staleVersions.length > 0) {
    await CvVersion.deleteMany({
      userId,
      _id: { $in: staleVersions.map((version) => version._id) },
    }, { session });
  }
}

function formatCvAuditRecord(audit: any) {
  return {
    id: audit._id.toString(),
    auditResult: audit.auditResult,
    suggestions: audit.suggestions,
    suggestionsGeneratedAt: audit.suggestionsGeneratedAt?.toISOString(),
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
      const connection = await connectMongo();
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

      let updatedProfile;
      try {
        updatedProfile = await serializeCvMutation(userId, () =>
          runInTransaction(connection, async (session) => {
        const currentProfile = await Profile.findOne(
          { userId },
          null,
          { session },
        );
        if (currentProfile?.cvText) {
          await CvVersion.create([{
            userId,
            cvText: currentProfile.cvText,
            uploadedAt:
              currentProfile.cvUpdatedAt ??
              currentProfile.updatedAt ??
              cvUpdatedAt,
          }], { session });
        }

        const updated = await Profile.findOneAndUpdate(
          {
            userId,
            ...(currentProfile?.cvText
              ? {
                  cvText: currentProfile.cvText,
                  ...(currentProfile.cvUpdatedAt
                    ? { cvUpdatedAt: currentProfile.cvUpdatedAt }
                    : {
                        $or: [
                          { cvUpdatedAt: { $exists: false } },
                          { cvUpdatedAt: null },
                        ],
                      }),
                }
              : {}),
          },
          {
            $set: { cvText, cvEmbedding, cvUpdatedAt },
            $unset: { cvAudit: 1, cvRefinement: 1 },
          },
          { new: true, upsert: !currentProfile, session },
        );
        if (!updated) throw new CvMutationConflictError();

        await pruneCvVersions(userId, session);
        return updated;
          }),
        );
      } catch (err) {
        if (!(err instanceof CvMutationConflictError)) throw err;
        res.status(409).json({
          error: "The current CV changed during upload. Please try again.",
        });
        return;
      }

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

router.get("/profile/cv/versions", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const versions = await CvVersion.find({ userId })
      .sort({ uploadedAt: -1, _id: -1 })
      .limit(5);

    res.json(
      GetCvVersionsResponse.parse({
        versions: versions.map((version) => ({
          id: version._id.toString(),
          cvText: version.cvText,
          uploadedAt: version.uploadedAt.toISOString(),
        })),
      }),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "getCvVersions error");
  }
});

router.post(
  "/profile/cv/versions/:versionId/restore",
  requireAuth,
  async (req, res) => {
    try {
      const connection = await connectMongo();
      const userId = (req as any).userId as string;
      const versionForEmbedding = await CvVersion.findOne({
        _id: req.params.versionId,
        userId,
      });
      if (!versionForEmbedding) {
        res.status(404).json({ error: "CV version not found" });
        return;
      }
      const restoredEmbedding = await generateEmbedding(
        versionForEmbedding.cvText.slice(0, 8000),
      );

      let outcome;
      try {
        outcome = await serializeCvMutation(userId, () =>
          runInTransaction(connection, async (session) => {
        const version = await CvVersion.findOne({
          _id: req.params.versionId,
          userId,
        }, null, { session });
        if (!version) return { status: "not-found" as const };

        const currentProfile = await Profile.findOne(
          { userId },
          null,
          { session },
        );
        const cvUpdatedAt = new Date();

        if (currentProfile?.cvText) {
          await CvVersion.create([{
            userId,
            cvText: currentProfile.cvText,
            uploadedAt:
              currentProfile.cvUpdatedAt ??
              currentProfile.updatedAt ??
              cvUpdatedAt,
          }], { session });
        }

        const restoredProfile = await Profile.findOneAndUpdate(
          {
            userId,
            ...(currentProfile?.cvText
              ? {
                  cvText: currentProfile.cvText,
                  ...(currentProfile.cvUpdatedAt
                    ? { cvUpdatedAt: currentProfile.cvUpdatedAt }
                    : {
                        $or: [
                          { cvUpdatedAt: { $exists: false } },
                          { cvUpdatedAt: null },
                        ],
                      }),
                }
              : {}),
          },
          {
            $set: {
              cvText: version.cvText,
              cvEmbedding: restoredEmbedding,
              cvUpdatedAt,
            },
            $unset: { cvAudit: 1, cvRefinement: 1 },
          },
          { new: true, session },
        );
        if (!restoredProfile) throw new CvMutationConflictError();

        await CvVersion.deleteOne({ _id: version._id, userId }, { session });
        await pruneCvVersions(userId, session);
        return { status: "restored" as const, cvUpdatedAt };
          }),
        );
      } catch (err) {
        if (!(err instanceof CvMutationConflictError)) throw err;
        res.status(409).json({
          error: "The current CV changed during restore. Please try again.",
        });
        return;
      }

      if (outcome.status === "not-found") {
        res.status(404).json({ error: "CV version not found" });
        return;
      }
      res.json(
        RestoreCvVersionResponse.parse({
          success: true,
          cvUpdatedAt: outcome.cvUpdatedAt.toISOString(),
        }),
      );
    } catch (err) {
      if ((err as { name?: string })?.name === "CastError") {
        res.status(404).json({ error: "CV version not found" });
        return;
      }
      sendInternalServerError(req, res, err, "restoreCvVersion error");
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
      auditResult: { $exists: true },
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
    const savedSuggestions = await CvAudit.findOne({
      userId,
      cvUpdatedAt: auditedCvUpdatedAt,
      suggestionsGeneratedAt: { $exists: true },
    }).sort({ createdAt: -1 });
    await CvAudit.create({
      userId,
      cvUpdatedAt: auditedCvUpdatedAt,
      auditResult: audit,
      suggestions: savedSuggestions?.suggestions,
      suggestionsGeneratedAt: savedSuggestions?.suggestionsGeneratedAt,
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
router.get("/profile/cv/refinements", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const refinements = await CvRefinement.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10);

    res.json(
      GetCvRefinementsResponse.parse({
        refinements: refinements.map((refinement) => ({
          id: refinement._id.toString(),
          jobId: refinement.jobId ?? null,
          jobTitle: refinement.jobTitle,
          jobDescription: refinement.jobDescription,
          refinedText: refinement.refinedText,
          createdAt: refinement.createdAt.toISOString(),
        })),
      }),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "getCvRefinements error");
  }
});

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
    const generatedAt = await serializeRefinementWrite(userId, async () => {
      const createdAt = new Date();
      await CvRefinement.create({
        userId,
        jobTitle: jobTitle?.trim() || "General role",
        jobDescription: jobDescription.trim().slice(0, 500),
        refinedText: result.refinedCv,
        createdAt,
      });

      const staleRefinements = await CvRefinement.find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(10)
        .select({ _id: 1 });
      if (staleRefinements.length > 0) {
        await CvRefinement.deleteMany({
          userId,
          _id: { $in: staleRefinements.map((refinement) => refinement._id) },
        });
      }
      return createdAt;
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
          cvRefinement: {
            ...result,
            jobTitle: jobTitle || null,
            jobDescription,
            generatedAt,
          },
        },
      },
      { new: true },
    );
    if (!currentProfile) {
      res.status(409).json({
        error:
          "The CV changed while refinement was running. The saved result is available in refinement history.",
      });
      return;
    }
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
    let profile = await Profile.findOne({ userId });

    if (!profile?.cvText) {
      res.status(400).json({ error: "No CV uploaded yet" });
      return;
    }

    if (!profile.cvUpdatedAt) {
      const legacyCvUpdatedAt = profile.updatedAt ?? new Date();
      const initializedProfile = await Profile.findOneAndUpdate(
        {
          userId,
          cvText: profile.cvText,
          $or: [
            { cvUpdatedAt: { $exists: false } },
            { cvUpdatedAt: null },
          ],
        },
        { $set: { cvUpdatedAt: legacyCvUpdatedAt } },
        { new: true },
      );

      if (initializedProfile) {
        profile = initializedProfile;
      } else {
        const currentProfile = await Profile.findOne({ userId });
        if (
          !currentProfile?.cvUpdatedAt ||
          currentProfile.cvText !== profile.cvText
        ) {
          res.status(409).json({
            error:
              "The CV changed while suggestions were being prepared. Please try again.",
          });
          return;
        }
        profile = currentProfile;
      }
    }

    const cvUpdatedAt = profile.cvUpdatedAt;
    const savedSuggestions = await CvAudit.findOne({
      userId,
      cvUpdatedAt,
      suggestionsGeneratedAt: { $exists: true },
    }).sort({ createdAt: -1 });

    if (savedSuggestions?.suggestionsGeneratedAt) {
      res.json(
        GetCvSuggestionsResponse.parse({
          suggestions: savedSuggestions.suggestions ?? [],
          generatedAt: savedSuggestions.suggestionsGeneratedAt.toISOString(),
        }),
      );
      return;
    }

    const flightKey = `${userId}:${cvUpdatedAt.toISOString()}`;
    let flight = suggestionFlights.get(flightKey);
    if (!flight) {
      const cvText = profile.cvText;
      flight = (async (): Promise<SuggestionGenerationOutcome> => {
        const suggestions = await generateCvSuggestions(cvText);
        const generatedAt = new Date();
        const currentProfile = await Profile.findOne({
          userId,
          cvText,
          cvUpdatedAt,
        });
        if (!currentProfile) return { ok: false };

        const latestRecord = await CvAudit.findOne({
          userId,
          cvUpdatedAt,
        }).sort({ createdAt: -1 });
        if (latestRecord) {
          await CvAudit.updateOne(
            { _id: latestRecord._id },
            { $set: { suggestions, suggestionsGeneratedAt: generatedAt } },
          );
        } else {
          await CvAudit.create({
            userId,
            cvUpdatedAt,
            suggestions,
            suggestionsGeneratedAt: generatedAt,
            createdAt: generatedAt,
          });
        }

        return { ok: true, suggestions, generatedAt };
      })();
      suggestionFlights.set(flightKey, flight);
      const clearFlight = () => {
        if (suggestionFlights.get(flightKey) === flight) {
          suggestionFlights.delete(flightKey);
        }
      };
      void flight.then(clearFlight, clearFlight);
    }

    const outcome = await flight;
    if (!outcome.ok) {
      res.status(409).json({
        error:
          "The CV changed while suggestions were being generated. Please try again.",
      });
      return;
    }

    res.json(
      GetCvSuggestionsResponse.parse({
        suggestions: outcome.suggestions,
        generatedAt: outcome.generatedAt.toISOString(),
      }),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "getCvSuggestions error");
  }
});

export default router;
