import Fastify from "fastify";
import pino from "pino";

import { registerHealthRoutes } from "./routes/health.js";
import { registerIocRoutes } from "./routes/ioc.js";

export function buildApp() {
  const logger = pino({ name: "iocheck" });

  const app = Fastify({
    loggerInstance: logger,
  });

  void app.register(registerHealthRoutes);
  void app.register(registerIocRoutes);

  return app;
}
