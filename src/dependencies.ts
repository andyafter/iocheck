import type { Logger } from "pino";

import {
  checkRedis,
  closeRedis,
  connectRedis,
  createRedisConnection,
  getCachedLookup,
  invalidateCachedLookup,
  setCachedLookup,
} from "./cache/redis.js";
import type { AppConfig } from "./config/index.js";
import { checkPostgres, createPostgresPool, findIoc, upsertIoc } from "./db/postgres.js";
import type { IocUpsertRequestInput, LookupRequestInput } from "./schemas/ioc.js";
import type { IocRecord, LookupResponse } from "./types/ioc.js";

export interface AppDependencies {
  findIoc(input: LookupRequestInput): Promise<IocRecord | null>;
  upsertIoc(input: IocUpsertRequestInput): Promise<IocRecord>;
  getCachedLookup(input: LookupRequestInput): Promise<LookupResponse | null>;
  setCachedLookup(
    input: LookupRequestInput,
    response: LookupResponse,
    ttlSeconds: number,
  ): Promise<void>;
  invalidateCachedLookup(input: LookupRequestInput): Promise<void>;
  checkPostgres(): Promise<void>;
  checkRedis(): Promise<void>;
  close(): Promise<void>;
  iocCacheTtlSeconds: number;
  iocNegativeCacheTtlSeconds: number;
}

export async function createAppDependencies(
  config: AppConfig,
  logger: Logger,
): Promise<AppDependencies> {
  const postgresPool = createPostgresPool();
  const redis = createRedisConnection(config.redisUrl, logger);

  await connectRedis(redis);

  return {
    findIoc: (input) => findIoc(postgresPool, input),
    upsertIoc: (input) => upsertIoc(postgresPool, input),
    getCachedLookup: (input) => getCachedLookup(redis, input),
    setCachedLookup: (input, response, ttlSeconds) =>
      setCachedLookup(redis, input, response, ttlSeconds),
    invalidateCachedLookup: (input) => invalidateCachedLookup(redis, input),
    checkPostgres: () => checkPostgres(postgresPool),
    checkRedis: () => checkRedis(redis),
    close: async () => {
      await closeRedis(redis);
      await postgresPool.end();
    },
    iocCacheTtlSeconds: config.iocCacheTtlSeconds,
    iocNegativeCacheTtlSeconds: config.iocNegativeCacheTtlSeconds,
  };
}
