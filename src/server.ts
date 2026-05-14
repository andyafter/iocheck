import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { loadConfig } from "./config/index.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp();

  try {
    await app.listen({ host: "0.0.0.0", port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryPoint) {
  void main();
}
