import "dotenv/config";

export interface AppConfig {
  port: number;
  redisUrl: string;
  iocCacheTtlSeconds: number;
  iocNegativeCacheTtlSeconds: number;
}

const DEFAULT_PORT = 3000;
const DEFAULT_REDIS_URL = "redis://localhost:6379";
const DEFAULT_IOC_CACHE_TTL_SECONDS = 600;
const DEFAULT_IOC_NEGATIVE_CACHE_TTL_SECONDS = 60;

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const value = Number(env[name] ?? defaultValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    port,
    redisUrl: env.REDIS_URL ?? DEFAULT_REDIS_URL,
    iocCacheTtlSeconds: readPositiveInteger(
      env,
      "IOC_CACHE_TTL_SECONDS",
      DEFAULT_IOC_CACHE_TTL_SECONDS,
    ),
    iocNegativeCacheTtlSeconds: readPositiveInteger(
      env,
      "IOC_NEGATIVE_CACHE_TTL_SECONDS",
      DEFAULT_IOC_NEGATIVE_CACHE_TTL_SECONDS,
    ),
  };
}
