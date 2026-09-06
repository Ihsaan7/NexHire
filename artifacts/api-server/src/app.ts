import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import multer from "multer";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

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

    req.log.error({ err }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
