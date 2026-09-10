import app from "./app";
import { logger } from "./lib/logger";
import { validateServerEnvironment } from "./lib/env";
import { connectMongo } from "./lib/mongodb";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  try {
    validateServerEnvironment();
    await connectMongo();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  } catch (err) {
    logger.fatal({ err }, "Server startup validation failed");
    process.exit(1);
  }
}

void startServer();
