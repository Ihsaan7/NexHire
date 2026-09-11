import type { Request, Response } from "express";
import { AiRateLimitError, AiTimeoutError } from "./aiErrors.js";
import { isDatabaseTimeoutError } from "./databaseErrors.js";

type ValidationIssue = {
  path: Array<string | number>;
  message: string;
};

type ValidationError = {
  issues: readonly ValidationIssue[];
};

export function sendValidationError(
  req: Request,
  res: Response,
  error: ValidationError,
): void {
  const message =
    error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "request";
        return `${path}: ${issue.message}`;
      })
      .join("; ") || "Invalid request";

  req.log.warn({ issues: error.issues }, "Request validation failed");
  res.status(400).json({ error: message });
}

export function sendInvalidRequest(
  req: Request,
  res: Response,
  message: string,
): void {
  req.log.warn({ message }, "Invalid request");
  res.status(400).json({ error: message });
}

export function sendInternalServerError(
  req: Request,
  res: Response,
  error: unknown,
  context: string,
): void {
  req.log.error({ err: error }, context);
  if (error instanceof AiRateLimitError) {
    const remaining = Math.max(
      1,
      Math.ceil((new Date(error.resetAt).getTime() - Date.now()) / 60000),
    );
    res.status(429).json({
      error: `AI limit reached. Try again in ${remaining} minutes.`,
      resetAt: error.resetAt,
    });
    return;
  }
  if (error instanceof AiTimeoutError) {
    res.status(504).json({ error: "AI service timed out. Please try again." });
    return;
  }
  if (isDatabaseTimeoutError(error)) {
    res
      .status(504)
      .json({ error: "Database request timed out. Please try again." });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}