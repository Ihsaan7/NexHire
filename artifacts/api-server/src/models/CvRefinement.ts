import mongoose, { Document, Schema } from "mongoose";

export interface ICvRefinement extends Document {
  userId: string;
  jobId?: string;
  jobTitle: string;
  jobDescription: string;
  refinedText: string;
  createdAt: Date;
}

const CvRefinementSchema = new Schema<ICvRefinement>(
  {
    userId: { type: String, required: true, index: true },
    jobId: { type: String },
    jobTitle: { type: String, required: true },
    jobDescription: { type: String, required: true },
    refinedText: { type: String, required: true },
  },
  {
    collection: "cvRefinements",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

CvRefinementSchema.index({ userId: 1, createdAt: -1, _id: -1 });

export const CvRefinement =
  mongoose.models.CvRefinement ||
  mongoose.model<ICvRefinement>("CvRefinement", CvRefinementSchema);