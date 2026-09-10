import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { mock, test } from "node:test";
import express, { type RequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const userId = "user_cv_studio_integration";
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../attached_assets/Ihsaan_CV_26_1780722171531.pdf",
);

type Audit = {
  score: number;
  issues: {
    category: string;
    severity: "high" | "medium" | "low";
    problem: string;
    correction: string;
  }[];
  strengths: string[];
  generatedAt?: Date;
};

type Refinement = {
  jobTitle: string | null;
  jobDescription: string;
  refinedCv: string;
  changes: string[];
  generatedAt?: Date;
};

type StoredProfile = {
  _id: { toString: () => string };
  userId: string;
  cvText?: string;
  cvEmbedding?: number[];
  cvUpdatedAt?: Date;
  cvScore?: number;
  cvIssues?: Audit["issues"];
  cvAudit?: Audit;
  cvRefinement?: Refinement;
  preferences: {
    sectors: string[];
    locations: string[];
    experienceLevel: string;
    minMatchScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

const profiles = new Map<string, StoredProfile>();
const cvAudits: {
  _id: { toString: () => string };
  userId: string;
  cvUpdatedAt: Date;
  auditResult?: Audit;
  suggestions?: string[];
  suggestionsGeneratedAt?: Date;
  createdAt: Date;
}[] = [];
const cvRefinements: {
  _id: { toString: () => string };
  userId: string;
  jobId?: string;
  jobTitle: string;
  jobDescription: string;
  refinedText: string;
  createdAt: Date;
}[] = [];
let refinementSequence = 0;
const cvVersions: {
  _id: { toString: () => string };
  userId: string;
  cvText: string;
  uploadedAt: Date;
}[] = [];
const matchAnalyses: {
  _id: { toString: () => string };
  userId: string;
  jobId?: string;
  matchScore: number;
  strengths?: string[];
  gaps?: string[];
  suggestions?: string[];
  cachedAt?: Date;
}[] = [];
let cvVersionSequence = 0;
let failNextProfileUpdate = false;
let failNextCvVersionDelete = false;
let failNextCvVersionPrune = false;
let failNextMatchAnalysisDelete = false;
let signalMatchAnalysisStarted: (() => void) | null = null;
let waitBeforeFinishingMatchAnalysis: Promise<void> | null = null;

function clone<T>(value: T): T {
  if (value === undefined) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "_id" in (value as Record<string, unknown>)
  ) {
    const source = value as T & { _id: { toString: () => string } };
    const { _id, ...rest } = source;
    return {
      ...structuredClone(rest),
      _id: { toString: () => _id.toString() },
    } as T;
  }
  return structuredClone(value);
}

function newProfile(profileUserId: string): StoredProfile {
  const now = new Date("2026-09-06T00:00:00.000Z");
  return {
    _id: { toString: () => `profile-${profileUserId}` },
    userId: profileUserId,
    preferences: {
      sectors: [],
      locations: [],
      experienceLevel: "",
      minMatchScore: 60,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function getOrCreate(profileUserId: string): StoredProfile {
  let profile = profiles.get(profileUserId);
  if (!profile) {
    profile = newProfile(profileUserId);
    profiles.set(profileUserId, profile);
  }
  return profile;
}

function applyUpdate(
  profile: StoredProfile,
  update: {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
  },
) {
  Object.assign(profile, update.$set);
  for (const key of Object.keys(update.$unset ?? {})) {
    delete (profile as Record<string, unknown>)[key];
  }
  profile.updatedAt = new Date("2026-09-06T00:00:01.000Z");
}

function matchesProfileQuery(
  profile: StoredProfile,
  query: Record<string, any>,
): boolean {
  const matchesValue = (actual: unknown, expected: any): boolean => {
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("$exists" in expected) {
        return expected.$exists ? actual !== undefined : actual === undefined;
      }
      if ("$in" in expected) {
        return expected.$in.some((value: unknown) =>
          matchesValue(actual, value),
        );
      }
    }
    if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    return actual === expected;
  };

  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (
        !(expected as Record<string, unknown>[]).some((condition) =>
          matchesProfileQuery(profile, condition),
        )
      ) {
        return false;
      }
      continue;
    }
    if (key === "userId") {
      if (profile.userId !== expected) return false;
      continue;
    }
    if (!matchesValue((profile as Record<string, unknown>)[key], expected)) {
      return false;
    }
  }
  return true;
}

const fakeProfileModel = {
  findOne(query: { userId: string }) {
    return Promise.resolve(profiles.get(query.userId) ? clone(profiles.get(query.userId)) : null);
  },
  create(input: { userId: string }) {
    const profile = newProfile(input.userId);
    profiles.set(input.userId, profile);
    return Promise.resolve(clone(profile));
  },
  findOneAndUpdate(
    query: { userId: string } & Record<string, unknown>,
    update: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, unknown>;
    },
    options: { upsert?: boolean } = {},
  ) {
    if (failNextProfileUpdate) {
      failNextProfileUpdate = false;
      return Promise.reject(new Error("Injected profile update failure"));
    }
    let profile = profiles.get(query.userId);
    if (!profile || !matchesProfileQuery(profile, query)) {
      if (!options.upsert) return Promise.resolve(null);
      profile = getOrCreate(query.userId);
    }
    applyUpdate(profile, update);
    return Promise.resolve(clone(profile));
  },
  updateOne(
    query: { userId: string },
    update: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, unknown>;
    },
  ) {
    const profile = getOrCreate(query.userId);
    applyUpdate(profile, update);
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
  },
};

const fakeCvAuditModel = {
  create(
    input:
      | {
          userId: string;
          cvUpdatedAt: Date;
          auditResult?: Audit;
          suggestions?: string[];
          suggestionsGeneratedAt?: Date;
          createdAt: Date;
        }
      | {
          userId: string;
          cvUpdatedAt: Date;
          auditResult?: Audit;
          suggestions?: string[];
          suggestionsGeneratedAt?: Date;
          createdAt: Date;
        }[],
  ) {
    const wasArray = Array.isArray(input);
    const auditInput = wasArray ? input[0] : input;
    assert.ok(auditInput);
    const id = `audit-${cvAudits.length + 1}`;
    const record = {
      ...clone(auditInput),
      _id: { toString: () => id },
    };
    cvAudits.push(record);
    return Promise.resolve(wasArray ? [clone(record)] : clone(record));
  },
  findOne(query: {
    userId: string;
    cvUpdatedAt: Date;
    auditResult?: { $exists: boolean };
    suggestionsGeneratedAt?: { $exists: boolean };
  }) {
    return {
      sort: () => {
        const record = cvAudits
          .filter(
            (audit) =>
              audit.userId === query.userId &&
              audit.cvUpdatedAt.getTime() === query.cvUpdatedAt.getTime() &&
              (query.auditResult?.$exists !== true || !!audit.auditResult) &&
              (query.suggestionsGeneratedAt?.$exists !== true ||
                !!audit.suggestionsGeneratedAt),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return Promise.resolve(record ? clone(record) : null);
      },
    };
  },
  updateOne(
    query: { _id: { toString: () => string } },
    update: { $set: Record<string, unknown> },
  ) {
    const record = cvAudits.find(
      (audit) => audit._id.toString() === query._id.toString(),
    );
    if (record) Object.assign(record, clone(update.$set));
    return Promise.resolve({
      acknowledged: true,
      modifiedCount: record ? 1 : 0,
    });
  },
  deleteMany(query: { userId: string }) {
    let deletedCount = 0;
    for (let index = cvAudits.length - 1; index >= 0; index -= 1) {
      if (cvAudits[index]?.userId === query.userId) {
        cvAudits.splice(index, 1);
        deletedCount += 1;
      }
    }
    return Promise.resolve({ acknowledged: true, deletedCount });
  },
};

const fakeCvRefinementModel = {
  create(
    input:
      | {
          userId: string;
          jobId?: string;
          jobTitle: string;
          jobDescription: string;
          refinedText: string;
          createdAt: Date;
        }
      | {
          userId: string;
          jobId?: string;
          jobTitle: string;
          jobDescription: string;
          refinedText: string;
          createdAt: Date;
        }[],
  ) {
    const wasArray = Array.isArray(input);
    const refinementInput = wasArray ? input[0] : input;
    assert.ok(refinementInput);
    refinementSequence += 1;
    const id = `refinement-${refinementSequence}`;
    const record = {
      ...clone(refinementInput),
      createdAt: new Date(
        new Date("2026-09-01T00:00:00.000Z").getTime() +
          refinementSequence,
      ),
      _id: { toString: () => id },
    };
    cvRefinements.push(record);
    return Promise.resolve(wasArray ? [clone(record)] : clone(record));
  },
  find(query: { userId: string }) {
    const sorted = () =>
      cvRefinements
        .filter((refinement) => refinement.userId === query.userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      sort: () => ({
        limit: (limit: number) =>
          Promise.resolve(sorted().slice(0, limit).map(clone)),
        skip: (skip: number) => ({
          select: () => Promise.resolve(sorted().slice(skip).map(clone)),
        }),
      }),
    };
  },
  deleteMany(query: {
    userId: string;
    _id?: { $in: { toString: () => string }[] };
  }) {
    const ids = query._id
      ? new Set(query._id.$in.map((id) => id.toString()))
      : null;
    let deletedCount = 0;
    for (let index = cvRefinements.length - 1; index >= 0; index -= 1) {
      const refinement = cvRefinements[index];
      if (
        refinement?.userId === query.userId &&
        (!ids || ids.has(refinement._id.toString()))
      ) {
        cvRefinements.splice(index, 1);
        deletedCount += 1;
      }
    }
    return Promise.resolve({ acknowledged: true, deletedCount });
  },
};

const fakeCvVersionModel = {
  create(
    input:
      | { userId: string; cvText: string; uploadedAt: Date }
      | { userId: string; cvText: string; uploadedAt: Date }[],
  ) {
    const wasArray = Array.isArray(input);
    const versionInput = wasArray ? input[0] : input;
    assert.ok(versionInput);
    cvVersionSequence += 1;
    const id = `version-${cvVersionSequence}`;
    const record = {
      ...clone(versionInput),
      _id: { toString: () => id },
    };
    cvVersions.push(record);
    return Promise.resolve(wasArray ? [clone(record)] : clone(record));
  },
  find(query: { userId: string }) {
    const sorted = () =>
      cvVersions
        .filter((version) => version.userId === query.userId)
        .sort((a, b) => {
          const dateDifference =
            b.uploadedAt.getTime() - a.uploadedAt.getTime();
          if (dateDifference !== 0) return dateDifference;
          return b._id.toString().localeCompare(a._id.toString());
        });
    return {
      sort: () => ({
        limit: (limit: number) =>
          Promise.resolve(sorted().slice(0, limit).map(clone)),
        skip: (skip: number) => ({
          select: () => Promise.resolve(sorted().slice(skip).map(clone)),
        }),
      }),
    };
  },
  findOne(query: { _id: string; userId: string }) {
    const version = cvVersions.find(
      (candidate) =>
        candidate.userId === query.userId &&
        candidate._id.toString() === query._id,
    );
    return Promise.resolve(version ? clone(version) : null);
  },
  deleteOne(query: {
    _id: { toString: () => string };
    userId: string;
  }) {
    if (failNextCvVersionDelete) {
      failNextCvVersionDelete = false;
      return Promise.reject(new Error("Injected CV version delete failure"));
    }
    const index = cvVersions.findIndex(
      (version) =>
        version.userId === query.userId &&
        version._id.toString() === query._id.toString(),
    );
    if (index >= 0) cvVersions.splice(index, 1);
    return Promise.resolve({
      acknowledged: true,
      deletedCount: index >= 0 ? 1 : 0,
    });
  },
  deleteMany(query: {
    userId: string;
    _id?: { $in: { toString: () => string }[] };
  }) {
    if (failNextCvVersionPrune) {
      failNextCvVersionPrune = false;
      return Promise.reject(new Error("Injected CV version prune failure"));
    }
    const ids = query._id
      ? new Set(query._id.$in.map((id) => id.toString()))
      : null;
    let deletedCount = 0;
    for (let index = cvVersions.length - 1; index >= 0; index -= 1) {
      const version = cvVersions[index];
      if (
        version?.userId === query.userId &&
        (!ids || ids.has(version._id.toString()))
      ) {
        cvVersions.splice(index, 1);
        deletedCount += 1;
      }
    }
    return Promise.resolve({ acknowledged: true, deletedCount });
  },
};

const fakeMatchAnalysisModel = {
  findOne(query: { userId: string; jobId: { toString: () => string } }) {
    const record = matchAnalyses.find(
      (analysis) =>
        analysis.userId === query.userId &&
        analysis.jobId === query.jobId.toString(),
    );
    return Promise.resolve(record ? clone(record) : null);
  },
  findOneAndUpdate(
    query: { userId: string; jobId: { toString: () => string } },
    update: { $set: Omit<(typeof matchAnalyses)[number], "_id" | "userId"> },
  ) {
    let record = matchAnalyses.find(
      (analysis) =>
        analysis.userId === query.userId &&
        analysis.jobId === query.jobId.toString(),
    );
    if (!record) {
      record = {
        _id: { toString: () => `match-${matchAnalyses.length + 1}` },
        userId: query.userId,
        jobId: query.jobId.toString(),
        matchScore: update.$set.matchScore,
      };
      matchAnalyses.push(record);
    }
    Object.assign(record, clone(update.$set));
    return Promise.resolve(clone(record));
  },
  deleteMany(query: { userId: string }) {
    if (failNextMatchAnalysisDelete) {
      failNextMatchAnalysisDelete = false;
      return Promise.reject(new Error("Injected match analysis delete failure"));
    }
    let deletedCount = 0;
    for (let index = matchAnalyses.length - 1; index >= 0; index -= 1) {
      if (matchAnalyses[index]?.userId === query.userId) {
        matchAnalyses.splice(index, 1);
        deletedCount += 1;
      }
    }
    return Promise.resolve({ acknowledged: true, deletedCount });
  },
};

const auditResult: Audit = {
  score: 82,
  issues: [
    {
      category: "Pakistan-Specific",
      severity: "medium",
      problem: "Add a WhatsApp contact number.",
      correction: "Include a reachable Pakistani WhatsApp number in the header.",
    },
  ],
  strengths: ["Clear technical objective", "Relevant Pakistani experience"],
};

const refinementResult = {
  refinedCv:
    "IHSAAN ULLAH\nSoftware Engineer\n\nTargeted summary for the Senior Software Engineer role.",
  changes: [
    "Reframed the summary around backend delivery.",
    "Prioritized REST API and database experience.",
  ],
};
const suggestionResult = [
  "Add measurable outcomes to your recent experience.",
  "Move your strongest technical skills closer to the top.",
];
let suggestionGenerationCount = 0;
const matchJobId = "507f1f77bcf86cd799439011";

const fakeJobModel = {
  findById(id: string) {
    if (id !== matchJobId) return Promise.resolve(null);
    return Promise.resolve({
      _id: { toString: () => matchJobId },
      title: "Senior Software Engineer",
      description: "Build reliable backend services.",
      requirements: "Node.js and MongoDB",
    });
  },
};

const moduleUrl = (relativePath: string) =>
  new URL(relativePath, import.meta.url).href;

mock.module(moduleUrl("../src/routes/auth.ts"), {
  namedExports: {
    requireAuth: ((req, res, next) => {
      if (req.headers.authorization !== "Bearer integration-test-session") {
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
    connectMongo: async () => ({
      readyState: 1,
      startSession: async () => ({
        withTransaction: async <T>(operation: () => Promise<T>) => {
          const profileSnapshot = new Map(
            [...profiles].map(([key, value]) => [key, clone(value)]),
          );
          const auditSnapshot = cvAudits.map(clone);
          const refinementSnapshot = cvRefinements.map(clone);
          const versionSnapshot = cvVersions.map(clone);
          const matchAnalysisSnapshot = matchAnalyses.map(clone);
          const refinementSequenceSnapshot = refinementSequence;
          const versionSequenceSnapshot = cvVersionSequence;
          try {
            return await operation();
          } catch (error) {
            profiles.clear();
            for (const [key, value] of profileSnapshot) {
              profiles.set(key, value);
            }
            cvAudits.splice(0, cvAudits.length, ...auditSnapshot);
            cvRefinements.splice(
              0,
              cvRefinements.length,
              ...refinementSnapshot,
            );
            cvVersions.splice(0, cvVersions.length, ...versionSnapshot);
            matchAnalyses.splice(
              0,
              matchAnalyses.length,
              ...matchAnalysisSnapshot,
            );
            refinementSequence = refinementSequenceSnapshot;
            cvVersionSequence = versionSequenceSnapshot;
            throw error;
          }
        },
        endSession: async () => undefined,
      }),
    }),
  },
});
mock.module(moduleUrl("../src/models/Profile.ts"), {
  namedExports: { Profile: fakeProfileModel },
});
mock.module(moduleUrl("../src/models/CvAudit.ts"), {
  namedExports: { CvAudit: fakeCvAuditModel },
});
mock.module(moduleUrl("../src/models/CvRefinement.ts"), {
  namedExports: { CvRefinement: fakeCvRefinementModel },
});
mock.module(moduleUrl("../src/models/CvVersion.ts"), {
  namedExports: { CvVersion: fakeCvVersionModel },
});
mock.module(moduleUrl("../src/models/MatchAnalysis.ts"), {
  namedExports: { MatchAnalysis: fakeMatchAnalysisModel },
});
mock.module(moduleUrl("../src/models/Job.ts"), {
  namedExports: { Job: fakeJobModel },
});
mock.module(moduleUrl("../src/lib/rateLimit.ts"), {
  namedExports: {
    checkRateLimit: () => ({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    }),
  },
});
mock.module(moduleUrl("../src/lib/gemini.ts"), {
  namedExports: {
    EMBEDDING_DIMENSIONS: 3,
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    auditCvPakistan: async () => ({ ...auditResult }),
    refineCvForJob: async () => ({ ...refinementResult }),
    generateCvSuggestions: async () => {
      suggestionGenerationCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [...suggestionResult];
    },
    analyzeJobMatch: async () => {
      signalMatchAnalysisStarted?.();
      if (waitBeforeFinishingMatchAnalysis) {
        await waitBeforeFinishingMatchAnalysis;
      }
      return {
        matchScore: 86,
        strengths: ["Backend experience"],
        gaps: ["More cloud detail"],
        suggestions: ["Add deployment outcomes"],
      };
    },
  },
});

const { default: profileRouter } = await import("../src/routes/profile.ts");
const { default: jobsRouter } = await import("../src/routes/jobs.ts");

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
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", profileRouter);
  app.use("/api", jobsRouter);
  return new Promise((resolveServer) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      resolveServer({
        server,
        baseUrl: `http://127.0.0.1:${address.port}/api`,
      });
    });
  });
}

async function apiRequest(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: "Bearer integration-test-session",
      ...(init.headers ?? {}),
    },
  });
}

test("persists CV Studio results across reloads and clears them for a replacement CV", async () => {
  profiles.clear();
  cvAudits.length = 0;
  cvRefinements.length = 0;
  refinementSequence = 0;
  cvVersions.length = 0;
  matchAnalyses.length = 0;
  cvVersionSequence = 0;
  failNextProfileUpdate = false;
  failNextCvVersionDelete = false;
  failNextCvVersionPrune = false;
  failNextMatchAnalysisDelete = false;
  signalMatchAnalysisStarted = null;
  waitBeforeFinishingMatchAnalysis = null;
  suggestionGenerationCount = 0;
  const fixture = await readFile(fixturePath);
  const { server, baseUrl } = await startTestServer();

  try {
    const upload = new FormData();
    upload.append(
      "file",
      new Blob([fixture], { type: "application/pdf" }),
      "ihsaan-cv.pdf",
    );

    const uploadResponse = await apiRequest(baseUrl, "/profile/cv", {
      method: "POST",
      body: upload,
    });
    assert.equal(uploadResponse.status, 200);
    assert.equal((await uploadResponse.json()).success, true);

    const profileAfterUpload = await apiRequest(baseUrl, "/profile");
    assert.equal(profileAfterUpload.status, 200);
    const uploadedProfile = await profileAfterUpload.json();
    assert.match(uploadedProfile.cvText, /IHSAAN ULLAH/);
    assert.ok(uploadedProfile.cvUpdatedAt);
    assert.equal(uploadedProfile.cvAudit, undefined);
    assert.equal(uploadedProfile.cvRefinement, undefined);

    const firstSuggestionsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/suggestions",
    );
    assert.equal(firstSuggestionsResponse.status, 200);
    const firstSuggestions = await firstSuggestionsResponse.json();
    assert.deepEqual(firstSuggestions.suggestions, suggestionResult);
    assert.ok(firstSuggestions.generatedAt);
    assert.equal(suggestionGenerationCount, 1);

    const restoredSuggestionsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/suggestions",
    );
    assert.equal(restoredSuggestionsResponse.status, 200);
    assert.deepEqual(await restoredSuggestionsResponse.json(), firstSuggestions);
    assert.equal(suggestionGenerationCount, 1);

    const auditResponse = await apiRequest(baseUrl, "/profile/cv/audit", {
      method: "POST",
    });
    assert.equal(auditResponse.status, 200);
    assert.deepEqual(await auditResponse.json(), {
      score: auditResult.score,
      issues: auditResult.issues,
      strengths: auditResult.strengths,
    });

    const latestAuditResponse = await apiRequest(
      baseUrl,
      "/profile/cv/audit",
    );
    assert.equal(latestAuditResponse.status, 200);
    const latestAudit = await latestAuditResponse.json();
    assert.equal(latestAudit.audit.id, "audit-2");
    assert.deepEqual(latestAudit.audit.auditResult, {
      score: auditResult.score,
      issues: auditResult.issues,
      strengths: auditResult.strengths,
    });
    assert.deepEqual(latestAudit.audit.suggestions, suggestionResult);
    assert.equal(cvAudits.length, 2);
    assert.deepEqual(cvAudits[1]?.suggestions, suggestionResult);
    assert.ok(latestAudit.audit.createdAt);

    const profileAfterAudit = await apiRequest(baseUrl, "/profile");
    const auditedProfile = await profileAfterAudit.json();
    assert.equal(auditedProfile.cvAudit.score, auditResult.score);
    assert.deepEqual(auditedProfile.cvAudit.issues, auditResult.issues);
    assert.deepEqual(auditedProfile.cvAudit.strengths, auditResult.strengths);
    assert.ok(auditedProfile.cvAudit.generatedAt);

    const jobDescription =
      "Build secure REST APIs and scalable database services for a senior software engineering team.";
    const refineResponse = await apiRequest(baseUrl, "/profile/cv/refine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobTitle: "Senior Software Engineer",
        jobDescription,
      }),
    });
    assert.equal(refineResponse.status, 200);
    assert.deepEqual(await refineResponse.json(), refinementResult);

    const firstRefinementsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/refinements",
    );
    assert.equal(firstRefinementsResponse.status, 200);
    const firstRefinements = await firstRefinementsResponse.json();
    assert.equal(firstRefinements.refinements.length, 1);
    assert.equal(
      firstRefinements.refinements[0].jobTitle,
      "Senior Software Engineer",
    );
    assert.equal(
      firstRefinements.refinements[0].refinedText,
      refinementResult.refinedCv,
    );
    assert.ok(firstRefinements.refinements[0].createdAt);

    const profileAfterRefine = await apiRequest(baseUrl, "/profile");
    const refinedProfile = await profileAfterRefine.json();
    assert.equal(refinedProfile.cvRefinement.jobTitle, "Senior Software Engineer");
    assert.equal(refinedProfile.cvRefinement.jobDescription, jobDescription);
    assert.equal(refinedProfile.cvRefinement.refinedCv, refinementResult.refinedCv);
    assert.deepEqual(refinedProfile.cvRefinement.changes, refinementResult.changes);
    assert.ok(refinedProfile.cvRefinement.generatedAt);
    assert.equal(refinedProfile.cvAudit.score, auditResult.score);

    const concurrentRefinementResponses = await Promise.all(
      Array.from({ length: 10 }, (_, offset) => {
        const index = offset + 2;
        return apiRequest(baseUrl, "/profile/cv/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jobTitle: `Role ${index}`,
            jobDescription: `${jobDescription} Iteration ${index}.`,
          }),
        });
      }),
    );
    concurrentRefinementResponses.forEach((response) => {
      assert.equal(response.status, 200);
    });

    const cappedRefinementsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/refinements",
    );
    assert.equal(cappedRefinementsResponse.status, 200);
    const cappedRefinements = await cappedRefinementsResponse.json();
    assert.equal(cappedRefinements.refinements.length, 10);
    assert.deepEqual(
      new Set(
        cappedRefinements.refinements.map(
          (refinement: { jobTitle: string }) => refinement.jobTitle,
        ),
      ),
      new Set(Array.from({ length: 10 }, (_, index) => `Role ${index + 2}`)),
    );
    assert.equal(cvRefinements.length, 10);

    const profileBeforeReplacement = profiles.get(userId);
    assert.ok(profileBeforeReplacement);
    profileBeforeReplacement.cvText =
      "ORIGINAL CV VERSION\nBackend engineer with five years of experience.";

    const replacement = new FormData();
    replacement.append(
      "file",
      new Blob([fixture], { type: "application/pdf" }),
      "replacement-cv.pdf",
    );
    const replacementResponse = await apiRequest(baseUrl, "/profile/cv", {
      method: "POST",
      body: replacement,
    });
    assert.equal(replacementResponse.status, 200);

    const profileAfterReplacement = await apiRequest(baseUrl, "/profile");
    const replacementProfile = await profileAfterReplacement.json();
    assert.match(replacementProfile.cvText, /IHSAAN ULLAH/);
    assert.equal(replacementProfile.cvAudit, undefined);
    assert.equal(replacementProfile.cvRefinement, undefined);

    const versionsAfterReplacementResponse = await apiRequest(
      baseUrl,
      "/profile/cv/versions",
    );
    assert.equal(versionsAfterReplacementResponse.status, 200);
    const versionsAfterReplacement =
      await versionsAfterReplacementResponse.json();
    assert.equal(versionsAfterReplacement.versions.length, 1);
    assert.match(
      versionsAfterReplacement.versions[0].cvText,
      /ORIGINAL CV VERSION/,
    );

    const restoreResponse = await apiRequest(
      baseUrl,
      `/profile/cv/versions/${versionsAfterReplacement.versions[0].id}/restore`,
      { method: "POST" },
    );
    assert.equal(restoreResponse.status, 200);
    const restoredResult = await restoreResponse.json();
    assert.equal(restoredResult.success, true);
    assert.ok(restoredResult.cvUpdatedAt);

    const profileAfterRestoreResponse = await apiRequest(baseUrl, "/profile");
    const profileAfterRestore = await profileAfterRestoreResponse.json();
    assert.match(profileAfterRestore.cvText, /ORIGINAL CV VERSION/);
    assert.equal(profileAfterRestore.cvAudit, undefined);
    assert.equal(profileAfterRestore.cvRefinement, undefined);

    const versionsAfterRestoreResponse = await apiRequest(
      baseUrl,
      "/profile/cv/versions",
    );
    const versionsAfterRestore = await versionsAfterRestoreResponse.json();
    assert.equal(versionsAfterRestore.versions.length, 1);
    assert.match(versionsAfterRestore.versions[0].cvText, /IHSAAN ULLAH/);

    const missingVersionResponse = await apiRequest(
      baseUrl,
      "/profile/cv/versions/version-owned-by-another-user/restore",
      { method: "POST" },
    );
    assert.equal(missingVersionResponse.status, 404);

    const replacementAuditResponse = await apiRequest(
      baseUrl,
      "/profile/cv/audit",
    );
    assert.equal(replacementAuditResponse.status, 200);
    assert.deepEqual(await replacementAuditResponse.json(), { audit: null });

    const concurrentSuggestionResponses = await Promise.all([
      apiRequest(baseUrl, "/profile/cv/suggestions"),
      apiRequest(baseUrl, "/profile/cv/suggestions"),
    ]);
    assert.equal(concurrentSuggestionResponses[0]?.status, 200);
    assert.equal(concurrentSuggestionResponses[1]?.status, 200);
    const concurrentSuggestions = await Promise.all(
      concurrentSuggestionResponses.map((response) => response.json()),
    );
    assert.deepEqual(concurrentSuggestions[0], concurrentSuggestions[1]);
    assert.equal(suggestionGenerationCount, 2);

    const legacyProfile = newProfile(userId);
    legacyProfile.cvText = "Legacy CV with no explicit upload timestamp";
    legacyProfile.updatedAt = new Date("2026-08-01T00:00:00.000Z");
    profiles.set(userId, legacyProfile);

    const legacySuggestionsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/suggestions",
    );
    assert.equal(legacySuggestionsResponse.status, 200);
    const legacySuggestions = await legacySuggestionsResponse.json();
    assert.equal(suggestionGenerationCount, 3);
    assert.ok(profiles.get(userId)?.cvUpdatedAt);

    await apiRequest(baseUrl, "/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferences: {
          sectors: ["private-tech"],
          experienceLevel: "mid",
        },
      }),
    });

    const restoredLegacySuggestionsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/suggestions",
    );
    assert.equal(restoredLegacySuggestionsResponse.status, 200);
    assert.deepEqual(
      await restoredLegacySuggestionsResponse.json(),
      legacySuggestions,
    );
    assert.equal(suggestionGenerationCount, 3);

    for (let index = 0; index < 6; index += 1) {
      const cappedUpload = new FormData();
      cappedUpload.append(
        "file",
        new Blob([fixture], { type: "application/pdf" }),
        `replacement-${index}.pdf`,
      );
      const cappedUploadResponse = await apiRequest(baseUrl, "/profile/cv", {
        method: "POST",
        body: cappedUpload,
      });
      assert.equal(cappedUploadResponse.status, 200);
    }

    const cappedVersionsResponse = await apiRequest(
      baseUrl,
      "/profile/cv/versions",
    );
    const cappedVersions = await cappedVersionsResponse.json();
    assert.equal(cappedVersions.versions.length, 5);
    assert.equal(cvVersions.length, 5);

    const snapshotVersionState = () =>
      cvVersions.map((version) => ({
        id: version._id.toString(),
        cvText: version.cvText,
        uploadedAt: version.uploadedAt.toISOString(),
      }));
    const snapshotProfileState = () => {
      const profile = profiles.get(userId);
      assert.ok(profile);
      const { _id: _ignoredId, ...data } = profile;
      return structuredClone(data);
    };

    const profileBeforeFailedUpload = snapshotProfileState();
    const versionsBeforeFailedUpload = snapshotVersionState();
    failNextProfileUpdate = true;
    const failedProfileUpload = new FormData();
    failedProfileUpload.append(
      "file",
      new Blob([fixture], { type: "application/pdf" }),
      "profile-failure.pdf",
    );
    const failedProfileUploadResponse = await apiRequest(
      baseUrl,
      "/profile/cv",
      { method: "POST", body: failedProfileUpload },
    );
    assert.equal(failedProfileUploadResponse.status, 500);
    assert.deepEqual(snapshotProfileState(), profileBeforeFailedUpload);
    assert.deepEqual(snapshotVersionState(), versionsBeforeFailedUpload);

    const profileBeforeFailedDelete = snapshotProfileState();
    const versionsBeforeFailedDelete = snapshotVersionState();
    failNextCvVersionDelete = true;
    const failedDeleteRestoreResponse = await apiRequest(
      baseUrl,
      `/profile/cv/versions/${cvVersions[0]?._id.toString()}/restore`,
      { method: "POST" },
    );
    assert.equal(failedDeleteRestoreResponse.status, 500);
    assert.deepEqual(snapshotProfileState(), profileBeforeFailedDelete);
    assert.deepEqual(snapshotVersionState(), versionsBeforeFailedDelete);

    const profileBeforeFailedPrune = snapshotProfileState();
    const versionsBeforeFailedPrune = snapshotVersionState();
    failNextCvVersionPrune = true;
    const failedPruneUpload = new FormData();
    failedPruneUpload.append(
      "file",
      new Blob([fixture], { type: "application/pdf" }),
      "prune-failure.pdf",
    );
    const failedPruneUploadResponse = await apiRequest(
      baseUrl,
      "/profile/cv",
      { method: "POST", body: failedPruneUpload },
    );
    assert.equal(failedPruneUploadResponse.status, 500);
    assert.deepEqual(snapshotProfileState(), profileBeforeFailedPrune);
    assert.deepEqual(snapshotVersionState(), versionsBeforeFailedPrune);

    const currentProfileBeforePrivacyDelete = profiles.get(userId);
    assert.ok(currentProfileBeforePrivacyDelete);
    currentProfileBeforePrivacyDelete.cvScore = 64;
    currentProfileBeforePrivacyDelete.cvIssues = auditResult.issues;

    const otherUserId = "other-cv-user";
    const otherProfile = newProfile(otherUserId);
    otherProfile.cvText = "Another user's private CV";
    otherProfile.cvEmbedding = [0.7, 0.8];
    profiles.set(otherUserId, otherProfile);
    cvAudits.push({
      _id: { toString: () => "other-audit" },
      userId: otherUserId,
      cvUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
      auditResult,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    cvRefinements.push({
      _id: { toString: () => "other-refinement" },
      userId: otherUserId,
      jobTitle: "Other role",
      jobDescription: "Other description",
      refinedText: "Other refined CV",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    cvVersions.push({
      _id: { toString: () => "other-version" },
      userId: otherUserId,
      cvText: "Another user's prior CV",
      uploadedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    matchAnalyses.push(
      {
        _id: { toString: () => "current-match" },
        userId,
        matchScore: 88,
      },
      {
        _id: { toString: () => "other-match" },
        userId: otherUserId,
        matchScore: 72,
      },
    );

    const countsBeforeFailedPrivacyDelete = {
      audits: cvAudits.length,
      refinements: cvRefinements.length,
      versions: cvVersions.length,
      analyses: matchAnalyses.length,
    };
    const profileBeforeFailedPrivacyDelete = snapshotProfileState();
    failNextMatchAnalysisDelete = true;
    const failedPrivacyDeleteResponse = await apiRequest(
      baseUrl,
      "/profile/cv",
      { method: "DELETE" },
    );
    assert.equal(failedPrivacyDeleteResponse.status, 500);
    assert.deepEqual(
      snapshotProfileState(),
      profileBeforeFailedPrivacyDelete,
    );
    assert.deepEqual(
      {
        audits: cvAudits.length,
        refinements: cvRefinements.length,
        versions: cvVersions.length,
        analyses: matchAnalyses.length,
      },
      countsBeforeFailedPrivacyDelete,
    );

    let releaseMatchAnalysis: (() => void) | undefined;
    const matchAnalysisStarted = new Promise<void>((resolveStarted) => {
      signalMatchAnalysisStarted = resolveStarted;
    });
    waitBeforeFinishingMatchAnalysis = new Promise<void>((resolveRelease) => {
      releaseMatchAnalysis = resolveRelease;
    });
    const inFlightMatchAnalysis = apiRequest(
      baseUrl,
      `/jobs/${matchJobId}/analyze`,
    );
    await matchAnalysisStarted;

    const deleteCvDataResponse = await apiRequest(baseUrl, "/profile/cv", {
      method: "DELETE",
    });
    assert.equal(deleteCvDataResponse.status, 200);
    assert.deepEqual(await deleteCvDataResponse.json(), { success: true });

    releaseMatchAnalysis?.();
    const staleMatchAnalysisResponse = await inFlightMatchAnalysis;
    assert.equal(staleMatchAnalysisResponse.status, 409);
    signalMatchAnalysisStarted = null;
    waitBeforeFinishingMatchAnalysis = null;

    const deletedProfile = profiles.get(userId);
    assert.ok(deletedProfile);
    assert.equal(deletedProfile.cvText, undefined);
    assert.equal(deletedProfile.cvEmbedding, undefined);
    assert.equal(deletedProfile.cvUpdatedAt, undefined);
    assert.equal(deletedProfile.cvScore, undefined);
    assert.equal(deletedProfile.cvIssues, undefined);
    assert.equal(deletedProfile.cvAudit, undefined);
    assert.equal(deletedProfile.cvRefinement, undefined);
    assert.equal(
      cvAudits.some((record) => record.userId === userId),
      false,
    );
    assert.equal(
      cvRefinements.some((record) => record.userId === userId),
      false,
    );
    assert.equal(
      cvVersions.some((record) => record.userId === userId),
      false,
    );
    assert.equal(
      matchAnalyses.some((record) => record.userId === userId),
      false,
    );

    assert.equal(profiles.get(otherUserId)?.cvText, otherProfile.cvText);
    assert.equal(
      cvAudits.some((record) => record.userId === otherUserId),
      true,
    );
    assert.equal(
      cvRefinements.some((record) => record.userId === otherUserId),
      true,
    );
    assert.equal(
      cvVersions.some((record) => record.userId === otherUserId),
      true,
    );
    assert.equal(
      matchAnalyses.some((record) => record.userId === otherUserId),
      true,
    );

    const profileAfterPrivacyDeleteResponse = await apiRequest(
      baseUrl,
      "/profile",
    );
    const profileAfterPrivacyDelete =
      await profileAfterPrivacyDeleteResponse.json();
    assert.equal(profileAfterPrivacyDelete.cvText, null);
    assert.equal(profileAfterPrivacyDelete.cvUpdatedAt, null);
    assert.equal(profileAfterPrivacyDelete.cvAudit, undefined);
    assert.equal(profileAfterPrivacyDelete.cvRefinement, undefined);

    const versionsAfterPrivacyDelete = await (
      await apiRequest(baseUrl, "/profile/cv/versions")
    ).json();
    assert.deepEqual(versionsAfterPrivacyDelete.versions, []);
    const refinementsAfterPrivacyDelete = await (
      await apiRequest(baseUrl, "/profile/cv/refinements")
    ).json();
    assert.deepEqual(refinementsAfterPrivacyDelete.refinements, []);
    const auditAfterPrivacyDelete = await (
      await apiRequest(baseUrl, "/profile/cv/audit")
    ).json();
    assert.equal(auditAfterPrivacyDelete.audit, null);

    const repeatedDeleteResponse = await apiRequest(baseUrl, "/profile/cv", {
      method: "DELETE",
    });
    assert.equal(repeatedDeleteResponse.status, 200);

    const unauthorizedDeleteResponse = await fetch(
      `${baseUrl}/profile/cv`,
      { method: "DELETE" },
    );
    assert.equal(unauthorizedDeleteResponse.status, 401);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});