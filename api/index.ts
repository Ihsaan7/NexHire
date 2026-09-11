import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app";
import { validateServerEnvironment } from "../artifacts/api-server/src/lib/env";
import { connectMongo } from "../artifacts/api-server/src/lib/mongodb";

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => void;

let startup: Promise<void> | undefined;

function prepareApi(): Promise<void> {
  startup ??= (async () => {
    validateServerEnvironment();
    await connectMongo();
  })();

  return startup;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await prepareApi();
  (app as unknown as NodeHandler)(request, response);
}