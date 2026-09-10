import mongoose, { Document, Schema } from "mongoose";

export interface ICvAudit extends Document {
  userId: string;
  cvUpdatedAt: Date;
  auditResult?: {
    score: number;
    issues: {
      category: string;
      severity: "high" | "medium" | "low";
      problem: string;
      correction: string;
    }[];
    strengths: string[];
  };
  suggestions?: string[];
  suggestionsGeneratedAt?: Date;
  createdAt: Date;
}

const AuditResultSchema = new Schema(
  {
    score: { type: Number, required: true },
    issues: {
      type: [
        {
          _id: false,
          category: { type: String, required: true },
          severity: {
            type: String,
            enum: ["high", "medium", "low"],
            required: true,
          },
          problem: { type: String, required: true },
          correction: { type: String, required: true },
        },
      ],
      required: true,
    },
    strengths: { type: [String], required: true },
  },
  { _id: false },
);

const CvAuditSchema = new Schema<ICvAudit>(
  {
    userId: { type: String, required: true, index: true },
    cvUpdatedAt: { type: Date, required: true },
    auditResult: { type: AuditResultSchema },
    suggestions: { type: [String], default: undefined },
    suggestionsGeneratedAt: { type: Date },
  },
  {
    collection: "cvAudits",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

CvAuditSchema.index({ userId: 1, cvUpdatedAt: 1, createdAt: -1 });

export const CvAudit =
  mongoose.models.CvAudit ||
  mongoose.model<ICvAudit>("CvAudit", CvAuditSchema);