import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodError } from "zod";

import { iocUpsertRequestSchema, lookupRequestSchema } from "../schemas/ioc.js";
import type { IocRecord, LookupResponse } from "../types/ioc.js";

function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({
    error: "Invalid request body",
    details: error.issues.map((issue) => issue.message),
  });
}

export async function registerIocRoutes(app: FastifyInstance): Promise<void> {
  app.post("/lookup", async (request, reply): Promise<LookupResponse | FastifyReply> => {
    const result = lookupRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError(reply, result.error);
    }

    return { verdict: "unknown" };
  });

  app.post("/ioc", async (request, reply): Promise<IocRecord | FastifyReply> => {
    const result = iocUpsertRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError(reply, result.error);
    }

    return reply.status(201).send({
      ...result.data,
      added_at: new Date().toISOString(),
    });
  });
}
