import type { FastifyInstance } from "fastify";

import { metricsRegistry } from "../metrics/index.js";

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/metrics", async (_request, reply) => {
    return reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });
}
