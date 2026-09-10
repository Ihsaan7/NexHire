import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mock, test } from "node:test";
import express, { type Request, type RequestHandler } from "express";

const userId = "practice-integration-user";

type StoredQuestion = {
  question: string;
  userAnswer?: string | null;
  aiFeedback?: string | null;
  score?: number | null;
};

type StoredSession = {
  _id: { toString: () => string };
  userId: string;
  mode: "cv" | "job" | "custom";
  jobTitle?: string | null;
  jobDescription?: string | null;
  topic?: string | null;
  messages: {
    role: "ai" | "user";
    content: string;
    feedback?: string | null;
    score?: number | null;
  }[];
  questions: StoredQuestion[];
  currentQuestion: string;
  questionNumber: number;
  isComplete: boolean;
  summary: string;
  avgScore: number;
  totalScore: number;
  status: "incomplete" | "complete";
  pendingAnswerToken?: string | null;
  pendingQuestionNumber?: number | null;
  pendingAnswerStartedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const sessions: StoredSession[] = [];
let sequence = 0;
let continueCallCount = 0;
let failNextContinuation = false;
let signalContinuationStarted: (() => void) | null = null;
let waitBeforeContinuation: Promise<void> | null = null;

function cloneSession(session: StoredSession): StoredSession {
  const id = session._id.toString();
  const { _id: _ignored, ...data } = session;
  return {
    ...structuredClone(data),
    _id: { toString: () => id },
  };
}

function matchesSession(
  session: StoredSession,
  query: Record<string, any>,
): boolean {
  for (const [key, expected] of Object.entries(query)) {
    const actual =
      key === "_id" ? session._id.toString() : (session as any)[key];
    if (expected && typeof expected === "object" && "$in" in expected) {
      if (!expected.$in.includes(actual)) return false;
    } else if (
      key === "_id" &&
      actual !==
        (typeof expected?.toString === "function"
          ? expected.toString()
          : expected)
    ) {
      return false;
    } else if (key !== "_id" && actual !== expected) {
      return false;
    }
  }
  return true;
}

const fakePracticeSessionModel = {
  create(input: Omit<StoredSession, "_id" | "createdAt" | "updatedAt">) {
    sequence += 1;
    const id = `practice-${sequence}`;
    const now = new Date(
      new Date("2026-09-11T00:00:00.000Z").getTime() + sequence * 1000,
    );
    const session: StoredSession = {
      ...structuredClone(input),
      _id: { toString: () => id },
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
    return Promise.resolve(cloneSession(session));
  },
  findOne(query: Record<string, any>) {
    const findMatch = () =>
      sessions
        .filter((session) => matchesSession(session, query))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const promise = Promise.resolve(
      findMatch() ? cloneSession(findMatch()!) : null,
    ) as Promise<StoredSession | null> & {
      sort: () => Promise<StoredSession | null>;
    };
    promise.sort = async () => {
      const match = findMatch();
      return match ? cloneSession(match) : null;
    };
    return promise;
  },
  findOneAndUpdate(
    query: Record<string, any>,
    update: { $set: Partial<StoredSession> },
  ) {
    const session = sessions.find((candidate) => {
      const baseMatches =
        candidate._id.toString() === query._id.toString() &&
        candidate.userId === query.userId &&
        candidate.questionNumber === query.questionNumber &&
        query.status.$in.includes(candidate.status);
      if (!baseMatches) return false;
      const staleBefore = query.$or[2].pendingAnswerStartedAt.$lt as Date;
      return (
        !candidate.pendingAnswerToken ||
        (!!candidate.pendingAnswerStartedAt &&
          candidate.pendingAnswerStartedAt < staleBefore)
      );
    });
    if (!session) return Promise.resolve(null);
    Object.assign(session, structuredClone(update.$set));
    return Promise.resolve(cloneSession(session));
  },
  updateOne(
    query: Record<string, any>,
    update: {
      $set?: Partial<StoredSession>;
      $unset?: Record<string, unknown>;
    },
  ) {
    const session = sessions.find((candidate) =>
      matchesSession(candidate, query),
    );
    if (!session) {
      if (!query.status) {
        throw new Error(`Unmatched final update: ${JSON.stringify(query)}`);
      }
      return Promise.resolve({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      });
    }
    Object.assign(session, structuredClone(update.$set ?? {}));
    for (const key of Object.keys(update.$unset ?? {})) {
      delete (session as Record<string, unknown>)[key];
    }
    sequence += 1;
    session.updatedAt = new Date(
      new Date("2026-09-11T00:00:00.000Z").getTime() + sequence * 1000,
    );
    return Promise.resolve({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
  },
};

const moduleUrl = (relativePath: string) =>
  new URL(relativePath, import.meta.url).href;

mock.module(moduleUrl("../src/routes/auth.ts"), {
  namedExports: {
    requireAuth: ((req, res, next) => {
      if (req.headers.authorization !== "Bearer practice-test-session") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as Request & { userId?: string }).userId = userId;
      next();
    }) satisfies RequestHandler,
  },
});
mock.module(moduleUrl("../src/lib/mongodb.ts"), {
  namedExports: {
    connectMongo: async () => ({ readyState: 1 }),
  },
});
mock.module(moduleUrl("../src/models/Profile.ts"), {
  namedExports: {
    Profile: {
      findOne: async () => ({
        cvText: "Backend engineer with Node.js and MongoDB experience.",
      }),
    },
  },
});
mock.module(moduleUrl("../src/models/PracticeSession.ts"), {
  namedExports: { PracticeSession: fakePracticeSessionModel },
});
mock.module(moduleUrl("../src/lib/gemini.ts"), {
  namedExports: {
    startPracticeSession: async () => ({
      intro: "We will complete a two-question interview.",
      firstQuestion: "Tell me about a difficult backend problem.",
    }),
    continuePracticeSession: async () => {
      if (failNextContinuation) {
        failNextContinuation = false;
        throw new Error("Injected Gemini failure");
      }
      signalContinuationStarted?.();
      if (waitBeforeContinuation) await waitBeforeContinuation;
      continueCallCount += 1;
      if (continueCallCount === 1) {
        return {
          feedback: "Clear example with a measurable result.",
          score: 8,
          nextQuestion: "How do you prevent duplicate writes?",
          isComplete: false,
        };
      }
      return {
        feedback: "Good use of idempotency and transactions.",
        score: 6,
        isComplete: true,
        summary: "Strong backend fundamentals.",
      };
    },
  },
});

const { default: practiceRouter } = await import("../src/routes/practice.ts");

function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use((req, _res, next) => {
    (req as Request & { log?: unknown }).log = {
      warn: () => undefined,
      error: () => undefined,
    };
    next();
  });
  app.use(express.json());
  app.use("/api", practiceRouter);

  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}/api`,
      });
    });
  });
}

function apiRequest(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer practice-test-session",
      ...(init.headers ?? {}),
    },
  });
}

test("persists practice progress, completion, and pending answers", async () => {
  sessions.length = 0;
  sequence = 0;
  continueCallCount = 0;
  failNextContinuation = false;
  signalContinuationStarted = null;
  waitBeforeContinuation = null;

  const { server, baseUrl } = await startTestServer();
  try {
    const startResponse = await apiRequest(baseUrl, "/practice/start", {
      method: "POST",
      body: JSON.stringify({ mode: "custom", topic: "Backend systems" }),
    });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json();
    assert.equal(started.questionNumber, 1);

    const firstSession = sessions[0];
    assert.ok(firstSession);
    assert.equal(firstSession.status, "incomplete");
    assert.equal(firstSession.totalScore, 0);
    assert.deepEqual(firstSession.questions, [
      {
        question: started.firstQuestion,
        userAnswer: null,
        aiFeedback: null,
        score: null,
      },
    ]);

    const initialReload = await (
      await apiRequest(baseUrl, "/practice/session")
    ).json();
    assert.equal(initialReload.status, "incomplete");
    assert.equal(initialReload.questions.length, 1);
    assert.equal(initialReload.totalScore, 0);

    const firstAnswerResponse = await apiRequest(
      baseUrl,
      "/practice/message",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: started.sessionId,
          mode: "custom",
          topic: "Backend systems",
          history: [{ role: "user", content: "First answer" }],
          answer: "I used a transaction and an idempotency key.",
          questionNumber: 1,
        }),
      },
    );
    const firstAnswerBody = await firstAnswerResponse.json();
    assert.equal(
      firstAnswerResponse.status,
      200,
      JSON.stringify(firstAnswerBody),
    );
    assert.equal(firstSession.status, "incomplete");
    assert.equal(firstSession.totalScore, 8, JSON.stringify(firstSession));
    assert.equal(firstSession.questions[0]?.score, 8);
    assert.equal(firstSession.questions[1]?.userAnswer, null);

    const midSessionReload = await (
      await apiRequest(baseUrl, "/practice/session")
    ).json();
    assert.equal(midSessionReload.questions[0].score, 8);
    assert.equal(
      midSessionReload.currentQuestion,
      "How do you prevent duplicate writes?",
    );

    const secondAnswerResponse = await apiRequest(
      baseUrl,
      "/practice/message",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: started.sessionId,
          mode: "custom",
          topic: "Backend systems",
          history: [{ role: "user", content: "Second answer" }],
          answer: "I combine unique constraints with idempotency keys.",
          questionNumber: 2,
        }),
      },
    );
    assert.equal(secondAnswerResponse.status, 200);
    assert.equal(firstSession.status, "complete");
    assert.equal(firstSession.totalScore, 7);
    assert.equal(firstSession.avgScore, 7);
    assert.equal(firstSession.questions.length, 2);

    const completedReload = await (
      await apiRequest(baseUrl, "/practice/session")
    ).json();
    assert.equal(completedReload.status, "complete");
    assert.equal(completedReload.isComplete, true);
    assert.equal(completedReload.totalScore, 7);
    assert.equal(completedReload.summary, "Strong backend fundamentals.");

    const secondStartResponse = await apiRequest(baseUrl, "/practice/start", {
      method: "POST",
      body: JSON.stringify({ mode: "custom", topic: "API reliability" }),
    });
    const secondStarted = await secondStartResponse.json();
    failNextContinuation = true;
    const failedAnswerResponse = await apiRequest(
      baseUrl,
      "/practice/message",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: secondStarted.sessionId,
          mode: "custom",
          topic: "API reliability",
          history: [{ role: "user", content: "Pending answer" }],
          answer: "I monitor error budgets and retry rates.",
          questionNumber: 1,
        }),
      },
    );
    assert.equal(failedAnswerResponse.status, 500);

    const pendingReload = await (
      await apiRequest(baseUrl, "/practice/session")
    ).json();
    assert.equal(pendingReload.status, "incomplete");
    assert.equal(
      pendingReload.questions[0].userAnswer,
      "I monitor error budgets and retry rates.",
    );
    assert.equal(pendingReload.questions[0].aiFeedback, null);
    assert.equal(pendingReload.questions[0].score, null);

    const retryAnswerResponse = await apiRequest(
      baseUrl,
      "/practice/message",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: secondStarted.sessionId,
          mode: "custom",
          topic: "API reliability",
          history: [{ role: "user", content: "Pending answer retry" }],
          answer: "I monitor error budgets and retry rates.",
          questionNumber: 1,
        }),
      },
    );
    assert.equal(retryAnswerResponse.status, 200);

    const concurrentStartResponse = await apiRequest(
      baseUrl,
      "/practice/start",
      {
        method: "POST",
        body: JSON.stringify({ mode: "custom", topic: "Concurrency" }),
      },
    );
    const concurrentStarted = await concurrentStartResponse.json();
    let releaseContinuation: (() => void) | undefined;
    const continuationStarted = new Promise<void>((resolveStarted) => {
      signalContinuationStarted = resolveStarted;
    });
    waitBeforeContinuation = new Promise<void>((resolveRelease) => {
      releaseContinuation = resolveRelease;
    });
    const answerBody = {
      sessionId: concurrentStarted.sessionId,
      mode: "custom",
      topic: "Concurrency",
      history: [{ role: "user", content: "Concurrent answer" }],
      answer: "I use an atomic lease.",
      questionNumber: 1,
    };
    const firstConcurrentAnswer = apiRequest(
      baseUrl,
      "/practice/message",
      { method: "POST", body: JSON.stringify(answerBody) },
    );
    await continuationStarted;
    const competingAnswerResponse = await apiRequest(
      baseUrl,
      "/practice/message",
      { method: "POST", body: JSON.stringify(answerBody) },
    );
    assert.equal(competingAnswerResponse.status, 409);
    releaseContinuation?.();
    const firstConcurrentAnswerResponse = await firstConcurrentAnswer;
    assert.equal(firstConcurrentAnswerResponse.status, 200);
    signalContinuationStarted = null;
    waitBeforeContinuation = null;

    const concurrentSession = sessions.find(
      (session) => session._id.toString() === concurrentStarted.sessionId,
    );
    assert.ok(concurrentSession);
    assert.equal(concurrentSession.questions.length, 1);
    assert.equal(concurrentSession.questionNumber, 2);
    assert.equal(concurrentSession.pendingAnswerToken, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});