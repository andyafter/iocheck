import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodError } from "zod";

import type { AppDependencies } from "../dependencies.js";
import {
  recordCacheRequest,
  recordIocUpsert,
  recordLookup,
  recordValidationFailure,
} from "../metrics/index.js";
import { iocUpsertRequestSchema, lookupRequestSchema } from "../schemas/ioc.js";
import type { IocRecord, LookupResponse } from "../types/ioc.js";

function sendValidationError(route: string, reply: FastifyReply, error: ZodError) {
  recordValidationFailure(route);

  return reply.status(400).send({
    error: "Invalid request body",
    details: error.issues.map((issue) => issue.message),
  });
}

export async function registerIocRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies,
): Promise<void> {
  app.post("/lookup", async (request, reply): Promise<LookupResponse | FastifyReply> => {
    const result = lookupRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError("/lookup", reply, result.error);
    }

    try {
      const cachedResponse = await dependencies.getCachedLookup(result.data);

      if (cachedResponse) {
        recordCacheRequest("hit", result.data.type);
        recordLookup(result.data.type, cachedResponse.verdict);

        return cachedResponse;
      }
    } catch (error) {
      request.log.error({ err: error }, "Redis lookup cache get failed");
    }

    recordCacheRequest("miss", result.data.type);

    const ioc = await dependencies.findIoc(result.data);
    const response: LookupResponse = ioc ? { verdict: "malicious", ioc } : { verdict: "unknown" };
    const ttlSeconds =
      response.verdict === "malicious"
        ? dependencies.iocCacheTtlSeconds
        : dependencies.iocNegativeCacheTtlSeconds;

    recordLookup(result.data.type, response.verdict);

    try {
      await dependencies.setCachedLookup(result.data, response, ttlSeconds);
    } catch (error) {
      request.log.error({ err: error }, "Redis lookup cache set failed");
    }

    return response;
  });

  app.post("/ioc", async (request, reply): Promise<IocRecord | FastifyReply> => {
    const result = iocUpsertRequestSchema.safeParse(request.body);

    if (!result.success) {
      return sendValidationError("/ioc", reply, result.error);
    }

    try {
      const ioc = await dependencies.upsertIoc(result.data);

      recordIocUpsert(result.data.type, "success");

      try {
        await dependencies.invalidateCachedLookup(result.data);
      } catch (error) {
        request.log.error({ err: error }, "Redis IOC cache invalidation failed");
      }

      return reply.status(201).send(ioc);
    } catch (error) {
      recordIocUpsert(result.data.type, "failure");
      throw error;
    }
  });
}
