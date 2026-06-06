import mongoose, { Schema, Document } from "mongoose";

export interface IProfile extends Document {
  userId: string;
  cvText?: string;
  cvEmbedding?: number[];
  cvUpdatedAt?: Date;
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
