import type { FastifyInstance, FastifyReply } from "fastify";

import type { AppDependencies } from "../dependencies.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies,
): Promise<void> {
  app.get("/healthz", async () => {
    return { status: "ok" };
  });

  app.get("/readyz", async (_request, reply): Promise<{ status: string } | FastifyReply> => {
    const [postgres, redis] = await Promise.allSettled([
      dependencies.checkPostgres(),
      dependencies.checkRedis(),
    ]);

    if (postgres.status === "fulfilled" && redis.status === "fulfilled") {
      return { status: "ready" };
    }

    return reply.status(503).send({
      status: "not_ready",
      dependencies: {
        postgres: postgres.status === "fulfilled" ? "ok" : "error",
        redis: redis.status === "fulfilled" ? "ok" : "error",
      },
    });
  });
}
