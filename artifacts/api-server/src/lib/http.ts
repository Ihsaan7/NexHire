import type { Request, Response } from "express";

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
  res.status(500).json({ error: "Internal server error" });
}