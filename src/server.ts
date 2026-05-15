import { pathToFileURL } from "node:url";

import pino from "pino";

import { buildApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createAppDependencies } from "./dependencies.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ name: "iocheck" });
  const dependencies = await createAppDependencies(config, logger);
  const app = buildApp({ dependencies, logger });
  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    app.log.info({ signal }, "Shutting down");
    await app.close();
    process.exitCode = 0;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({ host: "0.0.0.0", port: config.port });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryPoint) {
  void main().catch((error: unknown) => {
    pino({ name: "iocheck" }).error(error);
    process.exitCode = 1;
  });
}
