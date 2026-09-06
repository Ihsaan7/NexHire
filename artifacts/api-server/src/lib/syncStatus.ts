export type SyncKind = "jobs" | "gigs";
export type SyncState = "idle" | "running" | "succeeded" | "failed";

export type SyncStatus = {
  status: SyncState;
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessAt: string | null;
  message: string | null;
};

const statuses: Record<SyncKind, SyncStatus> = {
  jobs: {
    status: "idle",
    startedAt: null,
    completedAt: null,
    lastSuccessAt: null,
    message: null,
  },
  gigs: {
    status: "idle",
    startedAt: null,
    completedAt: null,
    lastSuccessAt: null,
    message: null,
  },
};

export function getSyncStatuses(): Record<SyncKind, SyncStatus> {
  return {
    jobs: { ...statuses.jobs },
    gigs: { ...statuses.gigs },
  };
}

export function beginSync(kind: SyncKind): boolean {
  if (statuses[kind].status === "running") return false;

  statuses[kind] = {
    ...statuses[kind],
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    message: `${kind === "jobs" ? "Job" : "Gig"} sync is running.`,
  };
  return true;
}

export function completeSync(kind: SyncKind, message: string): void {
  const completedAt = new Date().toISOString();
  statuses[kind] = {
    ...statuses[kind],
    status: "succeeded",
    completedAt,
    lastSuccessAt: completedAt,
    message,
  };
}

export function failSync(kind: SyncKind, message: string): void {
  statuses[kind] = {
    ...statuses[kind],
    status: "failed",
    completedAt: new Date().toISOString(),
    message,
  };
}