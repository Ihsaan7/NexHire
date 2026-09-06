type ErrorPayload = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const payload = data as ErrorPayload;
      if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
      if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
      if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
    }

    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      const message = (error as { message: string }).message.trim();
      if (message) return message;
    }
  }

  return fallback;
}