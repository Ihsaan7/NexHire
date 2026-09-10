import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();
export const runWithAiUser = <T>(userId: string, callback: () => T): T =>
  storage.run(userId, callback);
export const getAiUserId = (): string | undefined => storage.getStore();