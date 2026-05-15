import Fastify from "fastify";
import type { Logger } from "pino";
import pino from "pino";

import type { AppDependencies } from "./dependencies.js";
import { registerMetricsInstrumentation } from "./metrics/index.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIocRoutes } from "./routes/ioc.js";
import { registerMetricsRoutes } from "./routes/metrics.js";

export interface BuildAppOptions {
  dependencies: AppDependencies;
  logger?: Logger;
}

export function buildApp(options: BuildAppOptions) {
  const logger = options.logger ?? pino({ name: "iocheck" });

  const app = Fastify({
    loggerInstance: logger,
  });

  registerMetricsInstrumentation(app);

  void app.register(registerHealthRoutes, options.dependencies);
  void app.register(registerIocRoutes, options.dependencies);
  void app.register(registerMetricsRoutes);

  app.addHook("onClose", async () => {
    await options.dependencies.close();
  });

  return app;
}
