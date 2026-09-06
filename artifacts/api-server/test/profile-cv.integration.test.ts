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
    query: { userId: string },
    update: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, unknown>;
    },
  ) {
    const profile = getOrCreate(query.userId);
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
    connectMongo: async () => ({ readyState: 1 }),
  },
});
mock.module(moduleUrl("../src/models/Profile.ts"), {
  namedExports: { Profile: fakeProfileModel },
});
mock.module(moduleUrl("../src/lib/gemini.ts"), {
  namedExports: {
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    auditCvPakistan: async () => ({ ...auditResult }),
    refineCvForJob: async () => ({ ...refinementResult }),
    generateCvSuggestions: async () => [],
  },
});

const { default: profileRouter } = await import("../src/routes/profile.ts");

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

    const auditResponse = await apiRequest(baseUrl, "/profile/cv/audit", {
      method: "POST",
    });
    assert.equal(auditResponse.status, 200);
    assert.deepEqual(await auditResponse.json(), {
      score: auditResult.score,
      issues: auditResult.issues,
      strengths: auditResult.strengths,
    });

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

    const profileAfterRefine = await apiRequest(baseUrl, "/profile");
    const refinedProfile = await profileAfterRefine.json();
    assert.equal(refinedProfile.cvRefinement.jobTitle, "Senior Software Engineer");
    assert.equal(refinedProfile.cvRefinement.jobDescription, jobDescription);
    assert.equal(refinedProfile.cvRefinement.refinedCv, refinementResult.refinedCv);
    assert.deepEqual(refinedProfile.cvRefinement.changes, refinementResult.changes);
    assert.ok(refinedProfile.cvRefinement.generatedAt);
    assert.equal(refinedProfile.cvAudit.score, auditResult.score);

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
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});