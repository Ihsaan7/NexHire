import mongoose, { Schema, Document } from "mongoose";

export type SavedJobStatus =
  | "saved"
  | "applied"
  | "interview"
  | "rejected"
  | "offer";

export interface ISavedJob extends Document {
  userId: string;
  jobId: mongoose.Types.ObjectId;
  status: SavedJobStatus;
  notes?: string;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SavedJobSchema = new Schema<ISavedJob>(
  {
    userId: { type: String, required: true, index: true },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    status: {
      type: String,
      enum: ["saved", "applied", "interview", "rejected", "offer"],
      default: "saved",
    },
    notes: { type: String },
    appliedAt: { type: Date },
  },
  { timestamps: true },
);

SavedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const SavedJob =
  mongoose.models.SavedJob ||
  mongoose.model<ISavedJob>("SavedJob", SavedJobSchema);
