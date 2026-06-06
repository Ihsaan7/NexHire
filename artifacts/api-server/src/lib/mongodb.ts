import mongoose from "mongoose";
import { logger } from "./logger";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn: mongoose.Connection | undefined;
}

let cached: mongoose.Connection | undefined = global.__mongooseConn;

export async function connectMongo(): Promise<mongoose.Connection> {
  if (cached && cached.readyState === 1) {
    return cached;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (!cached) {
    logger.info("Connecting to MongoDB...");
    await mongoose.connect(uri, {
      bufferCommands: false,
    });
    cached = mongoose.connection;
    global.__mongooseConn = cached;
    logger.info("MongoDB connected");

    cached.on("error", (err) => {
      logger.error({ err }, "MongoDB connection error");
    });
    cached.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });
  }

  return cached;
}
