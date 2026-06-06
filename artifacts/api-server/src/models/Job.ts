import mongoose, { Schema, Document } from "mongoose";

export interface IJob extends Document {
  source: string;
  sourceJobId: string;
  title: string;
  company?: string;
  location?: string;
  sector?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  requirements?: string;
  qualifications?: string;
  experienceLevel?: string;
  jobType?: string;
  salaryRange?: string;
  postedDate?: Date;
  deadline?: Date;
  applyUrl?: string;
  applicationSteps: string[];
  embedding?: number[];
  createdAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    source: { type: String, required: true, index: true },
    sourceJobId: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String },
    location: { type: String },
    sector: { type: String, index: true },
    category: { type: String, index: true },
    subcategory: { type: String },
    description: { type: String },
    requirements: { type: String },
    qualifications: { type: String },
    experienceLevel: { type: String },
    jobType: { type: String },
    salaryRange: { type: String },
    postedDate: { type: Date, index: true },
    deadline: { type: Date, index: true },
    applyUrl: { type: String },
    applicationSteps: { type: [String], default: [] },
    embedding: { type: [Number], default: undefined },
  },
  { timestamps: true },
);

JobSchema.index({ source: 1, sourceJobId: 1 }, { unique: true });

export const Job =
  mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
