import { Router } from "express";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { startPracticeSession, continuePracticeSession } from "../lib/gemini";
import { logger } from "../lib/logger";

const router = Router();

// POST /api/practice/start
router.post("/practice/start", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const { mode, jobTitle, jobDescription, topic } = req.body;

    if (!mode || !["cv", "job", "custom"].includes(mode)) {
      res.status(400).json({ error: "mode must be 'cv', 'job', or 'custom'" });
      return;
    }
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
    res.json({ ...result, questionNumber: 1 });
  } catch (err) {
    logger.error({ err }, "practiceStart error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/practice/message
router.post("/practice/message", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const { mode, jobTitle, jobDescription, topic, history, answer, questionNumber } = req.body;

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
      questionNumber: questionNumber || 1,
    });

    res.json({ ...result, questionNumber: (questionNumber || 1) + 1 });
  } catch (err) {
    logger.error({ err }, "practiceMessage error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
