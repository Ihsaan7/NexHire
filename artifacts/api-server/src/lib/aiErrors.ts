export class AiRateLimitError extends Error {
  readonly resetAt: string;
  constructor(resetAt: Date | string) {
    super("AI rate limit reached");
    this.name = "AiRateLimitError";
    this.resetAt = new Date(resetAt).toISOString();
  }
}

export class AiTimeoutError extends Error {
  constructor() {
    super("AI provider timed out");
    this.name = "AiTimeoutError";
  }
}