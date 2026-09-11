import mongoose from "mongoose";
import { logger } from "./logger.js";

export const DB_TIMEOUT_MS = 10_000;
mongoose.set("maxTimeMS", DB_TIMEOUT_MS);

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
    const connectionOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: DB_TIMEOUT_MS,
      connectTimeoutMS: DB_TIMEOUT_MS,
      socketTimeoutMS: DB_TIMEOUT_MS,
    } as mongoose.ConnectOptions & { serverSelectionTimeoutMS: number };
    await mongoose.connect(uri, connectionOptions);
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

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
