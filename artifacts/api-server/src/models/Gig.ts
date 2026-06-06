import mongoose, { Schema, Document } from "mongoose";

export interface IGig extends Document {
  source: string;
  sourceGigId: string;
  title: string;
  company?: string;
  description?: string;
  applyUrl?: string;
  postedDate?: Date;
  taskType?: string;
  payModel?: string;
  estPayUSD?: number | null;
  difficulty?: string;
  legitScore?: number;
  redFlags?: string[];
  enrichedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GigSchema = new Schema<IGig>(
  {
    source: { type: String, required: true, index: true },
    sourceGigId: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String },
    description: { type: String },
    applyUrl: { type: String },
    postedDate: { type: Date, index: true },
    taskType: { type: String, index: true },
    payModel: { type: String, index: true },
    estPayUSD: { type: Number, default: null },
    difficulty: { type: String, index: true },
    legitScore: { type: Number, index: true },
    redFlags: { type: [String], default: [] },
    enrichedAt: { type: Date },
  },
  { timestamps: true },
);

GigSchema.index({ source: 1, sourceGigId: 1 }, { unique: true });
GigSchema.index({ legitScore: -1, createdAt: -1 });

export const Gig =
  mongoose.models.Gig || mongoose.model<IGig>("Gig", GigSchema);
