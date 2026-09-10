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
let cvVersionSequence = 0;
let failNextProfileUpdate = false;
let failNextCvVersionDelete = false;
let failNextCvVersionPrune = false;

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
    if (failNextProfileUpdate) {
      failNextProfileUpdate = false;
      return Promise.reject(new Error("Injected profile update failure"));
    }
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

const fakeCvAuditModel = {
  create(input: {
    userId: string;
    cvUpdatedAt: Date;
    auditResult?: Audit;
    suggestions?: string[];
    suggestionsGeneratedAt?: Date;
    createdAt: Date;
  }) {
    const id = `audit-${cvAudits.length + 1}`;
    const record = {
      ...clone(input),
      _id: { toString: () => id },
    };
    cvAudits.push(record);
    return Promise.resolve(clone(record));
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
};

const fakeCvRefinementModel = {
  create(input: {
    userId: string;
    jobId?: string;
    jobTitle: string;
    jobDescription: string;
    refinedText: string;
    createdAt: Date;
  }) {
    refinementSequence += 1;
    const id = `refinement-${refinementSequence}`;
    const record = {
      ...clone(input),
      createdAt: new Date(
        new Date("2026-09-01T00:00:00.000Z").getTime() +
          refinementSequence,
      ),
      _id: { toString: () => id },
    };
    cvRefinements.push(record);
    return Promise.resolve(clone(record));
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
    _id: { $in: { toString: () => string }[] };
  }) {
    const ids = new Set(query._id.$in.map((id) => id.toString()));
    let deletedCount = 0;
    for (let index = cvRefinements.length - 1; index >= 0; index -= 1) {
      const refinement = cvRefinements[index];
      if (
        refinement?.userId === query.userId &&
        ids.has(refinement._id.toString())
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
    _id: { $in: { toString: () => string }[] };
  }) {
    if (failNextCvVersionPrune) {
      failNextCvVersionPrune = false;
      return Promise.reject(new Error("Injected CV version prune failure"));
    }
    const ids = new Set(query._id.$in.map((id) => id.toString()));
    let deletedCount = 0;
    for (let index = cvVersions.length - 1; index >= 0; index -= 1) {
      const version = cvVersions[index];
      if (
        version?.userId === query.userId &&
        ids.has(version._id.toString())
      ) {
        cvVersions.splice(index, 1);
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
          const versionSnapshot = cvVersions.map(clone);
          const versionSequenceSnapshot = cvVersionSequence;
          try {
            return await operation();
          } catch (error) {
            profiles.clear();
            for (const [key, value] of profileSnapshot) {
              profiles.set(key, value);
            }
            cvVersions.splice(0, cvVersions.length, ...versionSnapshot);
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
mock.module(moduleUrl("../src/lib/gemini.ts"), {
  namedExports: {
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    auditCvPakistan: async () => ({ ...auditResult }),
    refineCvForJob: async () => ({ ...refinementResult }),
    generateCvSuggestions: async () => {
      suggestionGenerationCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [...suggestionResult];
    },
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
  cvAudits.length = 0;
  cvRefinements.length = 0;
  refinementSequence = 0;
  cvVersions.length = 0;
  cvVersionSequence = 0;
  failNextProfileUpdate = false;
  failNextCvVersionDelete = false;
  failNextCvVersionPrune = false;
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
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});