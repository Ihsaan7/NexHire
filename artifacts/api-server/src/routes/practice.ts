import { Router } from "express";
import { randomUUID } from "node:crypto";
import { isValidObjectId } from "mongoose";
import { requireAuth } from "./auth";
import { connectMongo } from "../lib/mongodb";
import { Profile } from "../models/Profile";
import { PracticeSession } from "../models/PracticeSession";
import { startPracticeSession, continuePracticeSession } from "../lib/gemini";
import {
  GetLatestPracticeSessionResponse,
  GetPracticeHistorySessionResponse,
  ListPracticeHistoryResponse,
  AbandonPracticeSessionResponse,
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
      questions: [{
        question: result.firstQuestion,
        userAnswer: null,
        aiFeedback: null,
        score: null,
        category: null,
        generationLabel: result.generationLabel,
        sources: result.sources,
      }],
      currentQuestion: result.firstQuestion,
      questionNumber: 1,
      isComplete: false,
      summary: "",
      avgScore: 0,
      totalScore: 0,
      status: "incomplete",
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
      status: { $in: ["incomplete", "complete", "active", "completed"] },
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

// POST /api/practice/session/:sessionId/abandon
router.post(
  "/practice/session/:sessionId/abandon",
  requireAuth,
  async (req, res) => {
    try {
      await connectMongo();
      const userId = (req as any).userId as string;
      const sessionId = req.params.sessionId;
      if (!isValidObjectId(sessionId)) {
        res.status(404).json({ error: "Practice session not found" });
        return;
      }
      const result = await PracticeSession.updateOne(
        {
          _id: sessionId,
          userId,
          status: { $in: ["incomplete", "active"] },
        },
        {
          $set: {
            status: "abandoned",
            isComplete: true,
          },
          $unset: {
            pendingAnswerToken: 1,
            pendingQuestionNumber: 1,
            pendingAnswerStartedAt: 1,
          },
        },
      );

      if (result.matchedCount === 0) {
        const existingSession = await PracticeSession.findOne({
          _id: sessionId,
          userId,
        });
        if (!existingSession) {
          res.status(404).json({ error: "Practice session not found" });
          return;
        }
      }

      res.json(
        AbandonPracticeSessionResponse.parse({
          message: "Practice session closed. You can start fresh.",
        }),
      );
    } catch (err) {
      sendInternalServerError(req, res, err, "practiceAbandon error");
    }
  },
);

// GET /api/practice/history
router.get("/practice/history", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    const recentSessions = await PracticeSession.find({
      userId,
      status: { $in: ["complete", "completed"] },
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100);

    const previousScoreByTopic = new Map<string, number>();
    const chronologicalItems = [...recentSessions]
      .reverse()
      .map((session: any) => {
        const totalScore = getPracticeTotalScore(session);
        const topic = getPracticeTopic(session);
        const topicKey = `${session.mode}:${topic
          .trim()
          .toLocaleLowerCase()}`;
        const previousScore = previousScoreByTopic.get(topicKey);
        previousScoreByTopic.set(topicKey, totalScore);
        const scoreImprovement =
          previousScore !== undefined && totalScore > previousScore
            ? Math.round((totalScore - previousScore) * 10) / 10
            : null;
        const questions = getPersistedQuestions(session);

        return {
          sessionId: session._id.toString(),
          mode: session.mode,
          topic,
          totalScore,
          questionCount: questions.filter(
            (question: { userAnswer?: string | null }) =>
              question.userAnswer,
          ).length,
          completedAt: session.updatedAt.toISOString(),
          previousScore: previousScore ?? null,
          scoreImprovement,
          skillBreakdown: getSkillBreakdown(questions),
        };
      });

    res.json(
      ListPracticeHistoryResponse.parse(
        chronologicalItems.reverse().slice(0, 50),
      ),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceHistoryList error");
  }
});

// GET /api/practice/history/:sessionId
router.get("/practice/history/:sessionId", requireAuth, async (req, res) => {
  try {
    await connectMongo();
    const userId = (req as any).userId as string;
    if (!isValidObjectId(req.params.sessionId)) {
      res.status(404).json({ error: "Completed practice session not found" });
      return;
    }
    const session = await PracticeSession.findOne({
      _id: req.params.sessionId,
      userId,
      status: { $in: ["complete", "completed"] },
    });
    if (!session) {
      res.status(404).json({ error: "Completed practice session not found" });
      return;
    }

    res.json(
      GetPracticeHistorySessionResponse.parse(
        formatPracticeSession(session),
      ),
    );
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceHistoryDetail error");
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
    const { sessionId, history, answer, questionNumber } = parsed.data;

    if (!answer?.trim()) {
      res.status(400).json({ error: "answer is required" });
      return;
    }

    const session = await PracticeSession.findOne({ _id: sessionId, userId });
    if (!session) {
      res.status(404).json({ error: "Practice session not found" });
      return;
    }
    if (
      session.isComplete ||
      !["incomplete", "active"].includes(session.status)
    ) {
      res.status(400).json({ error: "Practice session is already complete" });
      return;
    }
    if (questionNumber !== session.questionNumber) {
      res.status(409).json({ error: "Practice session is out of sync. Reload and try again." });
      return;
    }

    let cvText: string | undefined;
    if (session.mode === "cv") {
      const profile = await Profile.findOne({ userId });
      cvText = profile?.cvText;
    }

    const answeredQuestions = getPersistedQuestions(session);
    const currentQuestionMetadata =
      answeredQuestions[session.questionNumber - 1];
    answeredQuestions[session.questionNumber - 1] = {
      question: session.currentQuestion,
      userAnswer: answer,
      aiFeedback: null,
      score: null,
      category: null,
      generationLabel:
        currentQuestionMetadata?.generationLabel ?? "AI-generated",
      sources: currentQuestionMetadata?.sources ?? [],
    };
    const submissionToken = randomUUID();
    const pendingAnswerStartedAt = new Date();
    const staleLeaseBefore = new Date(
      pendingAnswerStartedAt.getTime() - 5 * 60 * 1000,
    );
    const answerCheckpoint = await PracticeSession.findOneAndUpdate(
      {
        _id: session._id,
        userId,
        questionNumber: session.questionNumber,
        status: { $in: ["incomplete", "active"] },
        $or: [
          { pendingAnswerToken: null },
          { pendingAnswerToken: { $exists: false } },
          { pendingAnswerStartedAt: { $lt: staleLeaseBefore } },
        ],
      },
      {
        $set: {
          questions: answeredQuestions,
          pendingAnswerToken: submissionToken,
          pendingQuestionNumber: session.questionNumber,
          pendingAnswerStartedAt,
        },
      },
      { new: true },
    );
    if (!answerCheckpoint) {
      res.status(409).json({
        error:
          "This answer is already being evaluated. Reload and try again.",
      });
      return;
    }

    const storedHistory = [
      ...session.messages.map((message: { role: "ai" | "user"; content: string }) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "ai" as const, content: session.currentQuestion },
      { role: "user" as const, content: answer },
    ];

    let result;
    try {
      result = await continuePracticeSession({
        mode: session.mode,
        cvText,
        jobTitle: session.jobTitle ?? undefined,
        jobDescription: session.jobDescription ?? undefined,
        topic: session.topic ?? undefined,
        history: storedHistory.length > 0 ? storedHistory : history || [],
        userAnswer: answer,
        questionNumber,
      });
    } catch (err) {
      await PracticeSession.updateOne(
        { _id: session._id, userId, pendingAnswerToken: submissionToken },
        {
          $unset: {
            pendingAnswerToken: 1,
            pendingQuestionNumber: 1,
            pendingAnswerStartedAt: 1,
          },
        },
      );
      throw err;
    }

    const updatedMessages = [
      ...session.messages,
      { role: "ai" as const, content: session.currentQuestion, feedback: null, score: null },
      { role: "user" as const, content: answer, feedback: result.feedback, score: result.score },
    ];
    const scores = updatedMessages
      .filter((message) => message.role === "user" && message.score !== null && message.score !== undefined)
      .map((message) => message.score as number);
    const isComplete = result.isComplete;
    const updatedQuestions = answeredQuestions;
    updatedQuestions[session.questionNumber - 1] = {
      question: session.currentQuestion,
      userAnswer: answer,
      aiFeedback: result.feedback,
      score: result.score,
      category: result.category,
      generationLabel:
        currentQuestionMetadata?.generationLabel ?? "AI-generated",
      sources: currentQuestionMetadata?.sources ?? [],
    };
    if (!isComplete && result.nextQuestion) {
      updatedQuestions.push({
        question: result.nextQuestion,
        userAnswer: null,
        aiFeedback: null,
        score: null,
        category: null,
        generationLabel:
          result.nextQuestionGenerationLabel ?? "AI-generated",
        sources: result.nextQuestionSources,
      });
    }
    const totalScore = scores.length
      ? Math.round(
          (scores.reduce((sum, score) => sum + score, 0) / scores.length) *
            10,
        ) / 10
      : 0;

    const finalUpdate = await PracticeSession.updateOne(
      {
        _id: session._id,
        userId,
        pendingAnswerToken: submissionToken,
        pendingQuestionNumber: session.questionNumber,
        questionNumber: session.questionNumber,
      },
      {
        $set: {
          messages: updatedMessages,
          questions: updatedQuestions,
          currentQuestion: result.nextQuestion ?? "",
          questionNumber: session.questionNumber + 1,
          isComplete,
          summary: result.summary ?? "",
          avgScore: totalScore,
          totalScore,
          status: isComplete ? "complete" : "incomplete",
        },
        $unset: {
          pendingAnswerToken: 1,
          pendingQuestionNumber: 1,
          pendingAnswerStartedAt: 1,
        },
      },
    );
    if (finalUpdate.matchedCount === 0) {
      res.status(409).json({
        error: "Practice session changed while the answer was evaluated.",
      });
      return;
    }

    res.json(SendPracticeMessageResponse.parse({
      sessionId,
      ...result,
      questionNumber: session.questionNumber + 1,
    }));
  } catch (err) {
    sendInternalServerError(req, res, err, "practiceMessage error");
  }
});

function getPersistedQuestions(session: any) {
  if (Array.isArray(session.questions) && session.questions.length > 0) {
    return session.questions.map((question: any) => ({
      question: question.question,
      userAnswer: question.userAnswer ?? null,
      aiFeedback: question.aiFeedback ?? null,
      score: question.score ?? null,
      category: question.category ?? null,
      generationLabel:
        question.generationLabel === "AI-generated from web research"
          ? "AI-generated from web research"
          : "AI-generated",
      sources: Array.isArray(question.sources)
        ? question.sources
            .filter(
              (source: any) =>
                typeof source?.site === "string" &&
                typeof source?.url === "string",
            )
            .slice(0, 5)
            .map((source: any) => ({
              site: source.site,
              url: source.url,
            }))
        : [],
    }));
  }

  const questions: {
    question: string;
    userAnswer: string;
    aiFeedback: string | null;
    score: number | null;
    category: string | null;
    generationLabel:
      | "AI-generated from web research"
      | "AI-generated";
    sources: { site: string; url: string }[];
  }[] = [];
  for (let index = 0; index < session.messages.length; index += 1) {
    const message = session.messages[index];
    const previous = session.messages[index - 1];
    if (message.role === "user" && previous?.role === "ai") {
      questions.push({
        question: previous.content,
        userAnswer: message.content,
        aiFeedback: message.feedback ?? null,
        score: message.score ?? null,
        category: null,
        generationLabel: "AI-generated",
        sources: [],
      });
    }
  }
  return questions;
}

function getSkillBreakdown(
  questions: {
    category?: string | null;
    score?: number | null;
    userAnswer?: string | null;
  }[],
) {
  const categories = new Map<
    string,
    { label: string; scoreTotal: number; count: number }
  >();
  for (const question of questions) {
    const label = question.category?.trim().replace(/\s+/g, " ");
    if (
      !label ||
      !question.userAnswer ||
      !Number.isFinite(question.score)
    ) {
      continue;
    }
    const key = label.toLocaleLowerCase();
    const existing = categories.get(key) ?? {
      label,
      scoreTotal: 0,
      count: 0,
    };
    existing.scoreTotal += question.score as number;
    existing.count += 1;
    categories.set(key, existing);
  }

  const scoredCategories = [...categories.values()].map((category) => ({
    label: category.label,
    average: category.scoreTotal / category.count,
  }));
  return {
    strong: scoredCategories
      .filter((category) => category.average >= 8)
      .sort(
        (left, right) =>
          right.average - left.average ||
          left.label.localeCompare(right.label),
      )
      .map((category) => category.label),
    needsWork: scoredCategories
      .filter((category) => category.average < 8)
      .sort(
        (left, right) =>
          left.average - right.average ||
          left.label.localeCompare(right.label),
      )
      .map((category) => category.label),
  };
}

function getPracticeTotalScore(session: any) {
  const totalScoreIsLegacyDefault =
    typeof session.$isDefault === "function" &&
    session.$isDefault("totalScore");
  return !totalScoreIsLegacyDefault && Number.isFinite(session.totalScore)
    ? session.totalScore
    : Number.isFinite(session.avgScore)
      ? session.avgScore
      : 0;
}

function getPracticeTopic(session: any) {
  if (session.mode === "job") {
    return session.jobTitle?.trim() || session.topic?.trim() || "Specific job";
  }
  if (session.mode === "custom") {
    return session.topic?.trim() || "Custom practice";
  }
  return "My CV";
}

function formatPracticeSession(session: any) {
  const questions = getPersistedQuestions(session);
  const totalScore = getPracticeTotalScore(session);
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
    questions,
    currentQuestion: session.currentQuestion,
    questionNumber: session.questionNumber,
    isComplete: session.isComplete,
    summary: session.summary,
    avgScore: session.avgScore,
    totalScore,
    skillBreakdown: getSkillBreakdown(questions),
    status:
      session.status === "complete" ||
      session.status === "completed" ||
      session.status === "abandoned"
        ? "complete"
        : "incomplete",
    startedAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export default router;
