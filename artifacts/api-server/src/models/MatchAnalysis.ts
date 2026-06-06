import mongoose, { Schema, Document } from "mongoose";

export interface IMatchAnalysis extends Document {
  userId: string;
  jobId: mongoose.Types.ObjectId;
  matchScore: number;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  cachedAt: Date;
}

const MatchAnalysisSchema = new Schema<IMatchAnalysis>({
  userId: { type: String, required: true, index: true },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
  },
  matchScore: { type: Number, required: true },
  strengths: { type: [String], default: [] },
  gaps: { type: [String], default: [] },
  suggestions: { type: [String], default: [] },
  cachedAt: { type: Date, default: Date.now },
});

MatchAnalysisSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const MatchAnalysis =
  mongoose.models.MatchAnalysis ||
  mongoose.model<IMatchAnalysis>("MatchAnalysis", MatchAnalysisSchema);
