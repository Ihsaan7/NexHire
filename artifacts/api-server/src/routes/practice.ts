import { Router } from "express";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { PracticeSession } from "../models/PracticeSession";
import { startPracticeSession, continuePracticeSession } from "../lib/gemini";
import {
  GetLatestPracticeSessionResponse,
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
    const session = await PracticeSession.create({
      userId,
      mode,
      jobTitle: jobTitle ?? null,
      jobDescription: jobDescription ?? null,
      topic: topic ?? null,
      messages: [{ role: "ai", content: result.intro, feedback: null, score: null }],
      currentQuestion: result.firstQuestion,
      questionNumber: 1,
      isComplete: false,
      summary: "",
      avgScore: 0,
      status: "active",
    });

    res.json(StartPracticeSessionResponse.parse({
      sessionId: session._id.toString(),
      ...result,
      questionNumber: 1,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceStart error");
  }
});

// GET /api/practice/session
router.get("/practice/session", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const session = await PracticeSession.findOne({
      userId,
      status: { $in: ["active", "completed"] },
    }).sort({ updatedAt: -1 });

    if (!session) {
      res.json(null);
      return;
    }

    res.json(GetLatestPracticeSessionResponse.parse(formatPracticeSession(session)));
  } catch (err) {
    sendInternalServerError(req, res, err, "getLatestPracticeSession error");
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
    const { sessionId, mode, jobTitle, jobDescription, topic, history, answer, questionNumber } = parsed.data;

    if (!answer?.trim()) {
      res.status(400).json({ error: "answer is required" });
      return;
    }

    const session = await PracticeSession.findOne({ _id: sessionId, userId });
    if (!session) {
      res.status(404).json({ error: "Practice session not found" });
      return;
    }
    if (session.isComplete || session.status !== "active") {
      res.status(400).json({ error: "Practice session is already complete" });
      return;
    }
    if (questionNumber !== session.questionNumber) {
      res.status(409).json({ error: "Practice session is out of sync. Reload and try again." });
      return;
    }

    let cvText: string | undefined;
    if (mode === "cv") {
      const profile = await Profile.findOne({ userId });
      cvText = profile?.cvText;
    }

    const storedHistory = [
      ...session.messages.map((message: { role: "ai" | "user"; content: string }) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "ai" as const, content: session.currentQuestion },
      { role: "user" as const, content: answer },
    ];

    const result = await continuePracticeSession({
      mode,
      cvText,
      jobTitle,
      jobDescription,
      topic,
      history: storedHistory.length > 0 ? storedHistory : history || [],
      userAnswer: answer,
      questionNumber,
    });

    const updatedMessages = [
      ...session.messages,
      { role: "ai" as const, content: session.currentQuestion, feedback: null, score: null },
      { role: "user" as const, content: answer, feedback: result.feedback, score: result.score },
    ];
    const scores = updatedMessages
      .filter((message) => message.role === "user" && message.score !== null && message.score !== undefined)
      .map((message) => message.score as number);
    const isComplete = result.isComplete;

    await PracticeSession.updateOne(
      { _id: session._id, userId },
      {
        $set: {
          messages: updatedMessages,
          currentQuestion: result.nextQuestion ?? "",
          questionNumber: session.questionNumber + 1,
          isComplete,
          summary: result.summary ?? "",
          avgScore: scores.length
            ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
            : 0,
          status: isComplete ? "completed" : "active",
        },
      },
    );

    res.json(SendPracticeMessageResponse.parse({
      sessionId,
      ...result,
      questionNumber: session.questionNumber + 1,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceMessage error");
  }
});

function formatPracticeSession(session: any) {
  return {
    sessionId: session._id.toString(),
    mode: session.mode,
    jobTitle: session.jobTitle ?? null,
    jobDescription: session.jobDescription ?? null,
    topic: session.topic ?? null,
    messages: session.messages.map((message: any) => ({
      role: message.role,
      content: message.content,
      feedback: message.feedback ?? null,
      score: message.score ?? null,
    })),
    currentQuestion: session.currentQuestion,
    questionNumber: session.questionNumber,
    isComplete: session.isComplete,
    summary: session.summary,
    avgScore: session.avgScore,
    status: session.status,
    startedAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export default router;
