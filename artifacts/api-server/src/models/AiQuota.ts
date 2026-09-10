import mongoose, { Schema } from "mongoose";

const aiQuotaSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const AiQuota =
  mongoose.models.AiQuota || mongoose.model("AiQuota", aiQuotaSchema);