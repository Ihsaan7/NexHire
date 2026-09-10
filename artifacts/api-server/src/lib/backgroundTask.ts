import { waitUntil } from "@vercel/functions";

export function registerBackgroundTask(task: Promise<unknown>): void {
  if (process.env.VERCEL) {
    waitUntil(task);
    return;
  }

  void task;
}