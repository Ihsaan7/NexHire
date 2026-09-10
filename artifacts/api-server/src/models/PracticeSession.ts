import mongoose, { Document, Schema } from "mongoose";

export type PracticeSessionRole = "ai" | "user";
export type PracticeSessionMode = "cv" | "job" | "custom";
export type PracticeSessionStatus =
  | "incomplete"
  | "complete"
  | "active"
  | "completed"
  | "abandoned";

export interface IPracticeSessionMessage {
  role: PracticeSessionRole;
  content: string;
  feedback?: string | null;
  score?: number | null;
}

export interface IPracticeSessionQuestion {
  question: string;
  userAnswer?: string | null;
  aiFeedback?: string | null;
  score?: number | null;
  category?: string | null;
}

export interface IPracticeSession extends Document {
  userId: string;
  mode: PracticeSessionMode;
  jobTitle?: string | null;
  jobDescription?: string | null;
  topic?: string | null;
  messages: IPracticeSessionMessage[];
  questions: IPracticeSessionQuestion[];
  currentQuestion: string;
  questionNumber: number;
  isComplete: boolean;
  summary: string;
  avgScore: number;
  totalScore: number;
  status: PracticeSessionStatus;
  pendingAnswerToken?: string | null;
  pendingQuestionNumber?: number | null;
  pendingAnswerStartedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PracticeSessionMessageSchema = new Schema<IPracticeSessionMessage>(
  {
    role: { type: String, enum: ["ai", "user"], required: true },
    content: { type: String, required: true },
    feedback: { type: String, default: null },
    score: { type: Number, default: null },
  },
  { _id: false },
);

const PracticeSessionQuestionSchema = new Schema<IPracticeSessionQuestion>(
  {
    question: { type: String, required: true },
    userAnswer: { type: String, default: null },
    aiFeedback: { type: String, default: null },
    score: { type: Number, default: null },
    category: { type: String, maxlength: 100, default: null },
  },
  { _id: false },
);

const PracticeSessionSchema = new Schema<IPracticeSession>(
  {
    userId: { type: String, required: true, index: true },
    mode: { type: String, enum: ["cv", "job", "custom"], required: true },
    jobTitle: { type: String, default: null },
    jobDescription: { type: String, default: null },
    topic: { type: String, default: null },
    messages: { type: [PracticeSessionMessageSchema], required: true, default: [] },
    questions: { type: [PracticeSessionQuestionSchema], required: true, default: [] },
    currentQuestion: { type: String, default: "" },
    questionNumber: { type: Number, required: true, min: 1 },
    isComplete: { type: Boolean, required: true, default: false },
    summary: { type: String, default: "" },
    avgScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["incomplete", "complete", "active", "completed", "abandoned"],
      required: true,
      default: "incomplete",
    },
    pendingAnswerToken: { type: String, default: null },
    pendingQuestionNumber: { type: Number, default: null },
    pendingAnswerStartedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

PracticeSessionSchema.index({ userId: 1, updatedAt: -1 });
PracticeSessionSchema.index({
  userId: 1,
  status: 1,
  updatedAt: -1,
  _id: -1,
});

export const PracticeSession =
  mongoose.models.PracticeSession ||
  mongoose.model<IPracticeSession>("PracticeSession", PracticeSessionSchema);