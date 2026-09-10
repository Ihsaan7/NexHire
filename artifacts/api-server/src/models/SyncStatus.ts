import mongoose, { Document, Schema } from "mongoose";

export type SyncKind = "jobs" | "gigs";

export interface ISyncStatus extends Document {
  kind: SyncKind;
  status: "idle" | "running" | "succeeded" | "failed";
  startedAt: Date | null;
  completedAt: Date | null;
  lastSuccessAt: Date | null;
  message: string | null;
  token: string | null;
  leaseUntil: Date | null;
}

const SyncStatusSchema = new Schema<ISyncStatus>(
  {
    kind: { type: String, enum: ["jobs", "gigs"], required: true, unique: true },
    status: { type: String, enum: ["idle", "running", "succeeded", "failed"], default: "idle" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    message: { type: String, default: null },
    token: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SyncStatus =
  mongoose.models.SyncStatus ||
  mongoose.model<ISyncStatus>("SyncStatus", SyncStatusSchema);