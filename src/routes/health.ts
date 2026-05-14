import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => {
    return { status: "ok" };
  });

  app.get("/readyz", async () => {
    // TODO: Check PostgreSQL and Redis connectivity when those dependencies are added.
    return { status: "ready" };
  });
}
