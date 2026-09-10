import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAllowedCorsOrigin,
  validateServerEnvironment,
} from "../src/lib/env.ts";
import { sendInternalServerError } from "../src/lib/http.ts";
import { AiRateLimitError, AiTimeoutError } from "../src/lib/aiErrors.ts";

const completeEnv = {
  MONGODB_URI: "mongodb://example.test/db",
  GEMINI_API_KEY: "test",
  CLERK_PUBLISHABLE_KEY: "pk_test",
  CLERK_SECRET_KEY: "sk_test",
  CRON_SECRET: "cron",
};

test("validates required startup environment and production origin", () => {
  assert.doesNotThrow(() =>
    validateServerEnvironment({ ...completeEnv, NODE_ENV: "development" }),
  );
  assert.throws(
    () => validateServerEnvironment({ NODE_ENV: "production" }),
    /MONGODB_URI.*GEMINI_API_KEY.*CLERK_PUBLISHABLE_KEY.*CLERK_SECRET_KEY.*CRON_SECRET.*PRODUCTION_ORIGIN/,
  );
  assert.throws(
    () =>
      validateServerEnvironment({
        ...completeEnv,
        NODE_ENV: "production",
        PRODUCTION_ORIGIN: "http://example.com",
      }),
    /HTTPS origin/,
  );
  assert.doesNotThrow(() =>
    validateServerEnvironment({
      ...completeEnv,
      NODE_ENV: "production",
      PRODUCTION_ORIGIN: "https://jobs.example.com",
    }),
  );
});

test("restricts CORS to the production origin and local development", () => {
  assert.equal(
    isAllowedCorsOrigin("https://jobs.example.com", {
      NODE_ENV: "production",
      PRODUCTION_ORIGIN: "https://jobs.example.com",
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin("https://evil.example", {
      NODE_ENV: "production",
      PRODUCTION_ORIGIN: "https://jobs.example.com",
    }),
    false,
  );
  assert.equal(
    isAllowedCorsOrigin("http://localhost:5173", {
      NODE_ENV: "development",
    }),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin("https://127.0.0.1:3000", {
      NODE_ENV: "development",
    }),
    true,
  );
});

test("returns exact quota and friendly timeout responses", () => {
  const createResponse = () => {
    const output: { status?: number; body?: unknown } = {};
    return {
      output,
      response: {
        status(code: number) {
          output.status = code;
          return this;
        },
        json(body: unknown) {
          output.body = body;
          return this;
        },
      },
    };
  };
  const request = {
    log: { error: () => undefined },
  } as any;
  const resetAt = new Date(Date.now() + 30 * 60 * 1000);
  const quota = createResponse();
  sendInternalServerError(
    request,
    quota.response as any,
    new AiRateLimitError(resetAt),
    "quota test",
  );
  assert.equal(quota.output.status, 429);
  assert.deepEqual(quota.output.body, {
    error: "AI limit reached. Try again in 30 minutes.",
    resetAt: resetAt.toISOString(),
  });

  const timeout = createResponse();
  sendInternalServerError(
    request,
    timeout.response as any,
    new AiTimeoutError(),
    "timeout test",
  );
  assert.equal(timeout.output.status, 504);
  assert.deepEqual(timeout.output.body, {
    error: "AI service timed out. Please try again.",
  });
});