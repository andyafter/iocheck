import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodError } from "zod";

import { recordIocUpsert, recordLookup, recordValidationFailure } from "../metrics/index.js";
import { iocUpsertRequestSchema, lookupRequestSchema } from "../schemas/ioc.js";
import type { IocRecord, LookupResponse } from "../types/ioc.js";

function sendValidationError(route: string, reply: FastifyReply, error: ZodError) {
  recordValidationFailure(route);

  return reply.status(400).send({
    error: "Invalid request body",
    details: error.issues.map((issue) => issue.message),
  });
}

export async function registerIocRoutes(app: FastifyInstance): Promise<void> {
  app.post("/lookup", async (request, reply): Promise<LookupResponse | FastifyReply> => {
    const result = lookupRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError("/lookup", reply, result.error);
    }

    recordLookup(result.data.type, "unknown");

    return { verdict: "unknown" };
  });

  app.post("/ioc", async (request, reply): Promise<IocRecord | FastifyReply> => {
    const result = iocUpsertRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError("/ioc", reply, result.error);
    }

    recordIocUpsert(result.data.type, "success");

    return reply.status(201).send({
      ...result.data,
      added_at: new Date().toISOString(),
    });
  });
}
