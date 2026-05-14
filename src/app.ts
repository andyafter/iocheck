import Fastify from "fastify";
import pino from "pino";

import { registerMetricsInstrumentation } from "./metrics/index.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIocRoutes } from "./routes/ioc.js";
import { registerMetricsRoutes } from "./routes/metrics.js";

export function buildApp() {
  const logger = pino({ name: "iocheck" });

  const app = Fastify({
    loggerInstance: logger,
  });

  registerMetricsInstrumentation(app);

  void app.register(registerHealthRoutes);
  void app.register(registerIocRoutes);
  void app.register(registerMetricsRoutes);

  return app;
}
