import { Router } from "express";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { startPracticeSession, continuePracticeSession } from "../lib/gemini";
import {
  SendPracticeMessageBody,
  SendPracticeMessageResponse,
  StartPracticeSessionBody,
  StartPracticeSessionResponse,
} from "@workspace/api-zod";
import { sendInternalServerError, sendValidationError } from "../lib/http";

const router = Router();

// POST /api/practice/start
router.post("/practice/start", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = StartPracticeSessionBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const { mode, jobTitle, jobDescription, topic } = parsed.data;

    if (mode === "job" && !jobDescription?.trim()) {
      res.status(400).json({ error: "jobDescription is required for job mode" });
      return;
    }
    if (mode === "custom" && !topic?.trim()) {
      res.status(400).json({ error: "topic is required for custom mode" });
      return;
    }

    let cvText: string | undefined;
    if (mode === "cv") {
      const profile = await Profile.findOne({ userId });
      if (!profile?.cvText) {
        res.status(400).json({ error: "No CV uploaded. Please upload your CV on the CV page first." });
        return;
      }
      cvText = profile.cvText;
    }

    const result = await startPracticeSession({ mode, cvText, jobTitle, jobDescription, topic });
    res.json(StartPracticeSessionResponse.parse({ ...result, questionNumber: 1 }));
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceStart error");
  }
});

// POST /api/practice/message
router.post("/practice/message", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const parsed = SendPracticeMessageBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(req, res, parsed.error);
      return;
    }
    const { mode, jobTitle, jobDescription, topic, history, answer, questionNumber } = parsed.data;

    if (!answer?.trim()) {
      res.status(400).json({ error: "answer is required" });
      return;
    }

    let cvText: string | undefined;
    if (mode === "cv") {
      const profile = await Profile.findOne({ userId });
      cvText = profile?.cvText;
    }

    const result = await continuePracticeSession({
      mode,
      cvText,
      jobTitle,
      jobDescription,
      topic,
      history: history || [],
      userAnswer: answer,
      questionNumber,
    });

    res.json(SendPracticeMessageResponse.parse({
      ...result,
      questionNumber: questionNumber + 1,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceMessage error");
  }
});

export default router;
