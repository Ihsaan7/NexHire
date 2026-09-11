import express from "express";
import type { NextFunction, Request, Response } from "express-serve-static-core";
import cors from "cors";
import { pinoHttp } from "pino-http";
import multer from "multer";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { isAllowedCorsOrigin } from "./lib/env.js";
import { isMongoReady } from "./lib/mongodb.js";
import { isDatabaseTimeoutError } from "./lib/databaseErrors.js";
import { AiRateLimitError, AiTimeoutError } from "./lib/aiErrors.js";

const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must come before body parsers
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      const allowed = isAllowedCorsOrigin(origin);
      callback(allowed ? null : new Error("CORS origin is not allowed"), allowed);
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req: Request) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use(
  "/api",
  (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health" || req.path === "/healthz") {
      next();
      return;
    }
    if (!isMongoReady()) {
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }
    next();
  },
  router,
);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.use(
  (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    if (res.headersSent) return;

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Uploaded file exceeds the 10 MB limit"
          : "Invalid file upload";
      req.log.warn({ err: err.code }, "File upload rejected");
      res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: message });
      return;
    }

    if (err instanceof Error && err.message === "Only PDF and DOCX files are allowed") {
      req.log.warn({ err: err.message }, "File upload rejected");
      res.status(400).json({ error: err.message });
      return;
    }

    if (err instanceof SyntaxError) {
      req.log.warn({ err: err.message }, "Malformed JSON request");
      res.status(400).json({ error: "Invalid JSON request body" });
      return;
    }

    if (err instanceof Error && err.message === "CORS origin is not allowed") {
      res.status(403).json({ error: "CORS origin is not allowed" });
      return;
    }

    if (err instanceof AiRateLimitError) {
      const remaining = Math.max(
        1,
        Math.ceil((new Date(err.resetAt).getTime() - Date.now()) / 60000),
      );
      res.status(429).json({
        error: `AI limit reached. Try again in ${remaining} minutes.`,
        resetAt: err.resetAt,
      });
      return;
    }

    if (err instanceof AiTimeoutError) {
      res.status(504).json({ error: "AI service timed out. Please try again." });
      return;
    }

    if (isDatabaseTimeoutError(err)) {
      res
        .status(504)
        .json({ error: "Database request timed out. Please try again." });
      return;
    }

    req.log.error({ err }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
