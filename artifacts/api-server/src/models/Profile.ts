import mongoose, { Schema, Document } from "mongoose";

export interface IProfile extends Document {
  userId: string;
  cvText?: string;
  cvEmbedding?: number[];
  cvUpdatedAt?: Date;
  cvAudit?: {
    score: number;
    issues: {
      category: string;
      severity: "high" | "medium" | "low";
      problem: string;
      correction: string;
    }[];
    strengths: string[];
    generatedAt: Date;
  };
  cvRefinement?: {
    jobTitle: string | null;
    jobDescription: string;
    refinedCv: string;
    changes: string[];
    generatedAt: Date;
  };
  preferences: {
    sectors: string[];
    locations: string[];
    experienceLevel: string;
    minMatchScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<IProfile>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    cvText: { type: String },
    cvEmbedding: { type: [Number], default: undefined },
    cvUpdatedAt: { type: Date },
  cvAudit: {
    score: { type: Number },
    issues: {
      type: [
        {
          category: { type: String },
          severity: { type: String, enum: ["high", "medium", "low"] },
          problem: { type: String },
          correction: { type: String },
        },
      ],
    },
    strengths: { type: [String] },
    generatedAt: { type: Date },
  },
  cvRefinement: {
    jobTitle: { type: String, default: null },
    jobDescription: { type: String },
    refinedCv: { type: String },
    changes: { type: [String] },
    generatedAt: { type: Date },
  },
    preferences: {
      sectors: { type: [String], default: [] },
      locations: { type: [String], default: [] },
      experienceLevel: { type: String, default: "" },
      minMatchScore: { type: Number, default: 60 },
    },
  },
  { timestamps: true },
);

export const Profile =
  mongoose.models.Profile ||
  mongoose.model<IProfile>("Profile", ProfileSchema);
