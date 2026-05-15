import "dotenv/config";

import type { Logger } from "pino";
import { createClient } from "redis";

import { recordRedisOperation } from "../metrics/index.js";
import type { LookupRequestInput } from "../schemas/ioc.js";
import type { LookupResponse } from "../types/ioc.js";

export interface RedisConnection {
  isOpen: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  on(event: "error", listener: (error: Error) => void): unknown;
}

function durationSecondsSince(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

export function createRedisConnection(redisUrl = process.env.REDIS_URL, logger?: Logger): RedisConnection {
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const client = createClient({ url: redisUrl }) as RedisConnection;

  client.on("error", (error) => {
    logger?.error({ err: error }, "Redis client error");
  });

  return client;
}

export async function connectRedis(connection: RedisConnection): Promise<void> {
  if (!connection.isOpen) {
    await connection.connect();
  }
}

export async function closeRedis(connection: RedisConnection): Promise<void> {
  if (connection.isOpen) {
    await connection.quit();
  }
}

export function iocCacheKey(input: LookupRequestInput): string {
  return `ioc:${input.type}:${input.value}`;
}

export async function getCachedLookup(
  connection: RedisConnection,
  input: LookupRequestInput,
): Promise<LookupResponse | null> {
  const startedAt = process.hrtime.bigint();

  try {
    const value = await connection.get(iocCacheKey(input));

    recordRedisOperation("get", "success", durationSecondsSince(startedAt));

    return value ? (JSON.parse(value) as LookupResponse) : null;
  } catch (error) {
    recordRedisOperation("get", "failure", durationSecondsSince(startedAt));
    throw error;
  }
}

export async function setCachedLookup(
  connection: RedisConnection,
  input: LookupRequestInput,
  response: LookupResponse,
  ttlSeconds: number,
): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    await connection.set(iocCacheKey(input), JSON.stringify(response), { EX: ttlSeconds });
    recordRedisOperation("set", "success", durationSecondsSince(startedAt));
  } catch (error) {
    recordRedisOperation("set", "failure", durationSecondsSince(startedAt));
    throw error;
  }
}

export async function invalidateCachedLookup(
  connection: RedisConnection,
  input: LookupRequestInput,
): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    await connection.del(iocCacheKey(input));
    recordRedisOperation("invalidate", "success", durationSecondsSince(startedAt));
  } catch (error) {
    recordRedisOperation("invalidate", "failure", durationSecondsSince(startedAt));
    throw error;
  }
}

export async function checkRedis(connection: RedisConnection): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    await connection.ping();
    recordRedisOperation("health_check", "success", durationSecondsSince(startedAt));
  } catch (error) {
    recordRedisOperation("health_check", "failure", durationSecondsSince(startedAt));
    throw error;
  }
}
