const REQUIRED_SERVER_ENV = [
  "MONGODB_URI",
  "GEMINI_API_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CRON_SECRET",
] as const;

export function validateServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing: string[] = REQUIRED_SERVER_ENV.filter(
    (key) => !env[key]?.trim(),
  );
  if (env.NODE_ENV === "production" && !env.PRODUCTION_ORIGIN?.trim()) {
    missing.push("PRODUCTION_ORIGIN");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
  if (env.PRODUCTION_ORIGIN) {
    const origin = new URL(env.PRODUCTION_ORIGIN);
    if (origin.protocol !== "https:" || origin.origin !== env.PRODUCTION_ORIGIN) {
      throw new Error(
        "PRODUCTION_ORIGIN must be an HTTPS origin without a path.",
      );
    }
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) return true;
  if (env.PRODUCTION_ORIGIN && origin === env.PRODUCTION_ORIGIN) return true;
  if (env.NODE_ENV !== "production") {
    if (
      env.REPLIT_DEV_DOMAIN &&
      origin === `https://${env.REPLIT_DEV_DOMAIN}`
    ) {
      return true;
    }
    try {
      const url = new URL(origin);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      );
    } catch {
      return false;
    }
  }
  return false;
}