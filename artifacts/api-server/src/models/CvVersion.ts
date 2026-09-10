import mongoose, { Document, Schema } from "mongoose";

export interface ICvVersion extends Document {
  userId: string;
  cvText: string;
  uploadedAt: Date;
}

const CvVersionSchema = new Schema<ICvVersion>(
  {
    userId: { type: String, required: true, index: true },
    cvText: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  {
    collection: "cvVersions",
    versionKey: false,
  },
);

CvVersionSchema.index({ userId: 1, uploadedAt: -1, _id: -1 });

export const CvVersion =
  mongoose.models.CvVersion ||
  mongoose.model<ICvVersion>("CvVersion", CvVersionSchema);