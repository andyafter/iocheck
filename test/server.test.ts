import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/index.js";
import type { AppDependencies } from "../src/dependencies.js";
import type { IocRecord } from "../src/types/ioc.js";

function createDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    findIoc: vi.fn(async () => null),
    upsertIoc: vi.fn(async (input) => ({
      ...input,
      added_at: "2026-05-15T00:00:00.000Z",
    })),
    getCachedLookup: vi.fn(async () => null),
    setCachedLookup: vi.fn(async () => undefined),
    invalidateCachedLookup: vi.fn(async () => undefined),
    checkPostgres: vi.fn(async () => undefined),
    checkRedis: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    iocCacheTtlSeconds: 600,
    iocNegativeCacheTtlSeconds: 60,
    ...overrides,
  };
}

describe("app", () => {
  it("builds a Fastify instance", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    expect(app.server).toBeDefined();

    await app.close();
  });

  it("returns health status", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("returns readiness status", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });

    await app.close();
  });

  it("returns not ready when Redis is unreachable", async () => {
    const app = buildApp({
      dependencies: createDependencies({
        checkRedis: vi.fn(async () => {
          throw new Error("redis unavailable");
        }),
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      dependencies: {
        postgres: "ok",
        redis: "error",
      },
    });

    await app.close();
  });

  it("returns unknown for a valid lookup", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "domain",
        value: "example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ verdict: "unknown" });

    await app.close();
  });

  it("rejects a lookup with an invalid type", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "url",
        value: "https://example.com",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid request body" });

    await app.close();
  });

  it("creates a temporary IOC response for valid input", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "POST",
      url: "/ioc",
      payload: {
        type: "sha256",
        value: "a".repeat(64),
        source: "manual",
        score: 80,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      type: "sha256",
      value: "a".repeat(64),
      source: "manual",
      score: 80,
    });
    expect(typeof response.json().added_at).toBe("string");

    await app.close();
  });

  it("rejects an IOC with an invalid score", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    const response = await app.inject({
      method: "POST",
      url: "/ioc",
      payload: {
        type: "ip",
        value: "127.0.0.1",
        source: "manual",
        score: 101,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid request body" });

    await app.close();
  });

  it("returns a cached lookup result without querying PostgreSQL", async () => {
    const ioc: IocRecord = {
      type: "domain",
      value: "example.com",
      source: "manual",
      score: 80,
      added_at: "2026-05-15T00:00:00.000Z",
    };
    const dependencies = createDependencies({
      getCachedLookup: vi.fn(async () => ({ verdict: "malicious" as const, ioc })),
    });
    const app = buildApp({ dependencies });

    const response = await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "domain",
        value: "example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ verdict: "malicious", ioc });
    expect(dependencies.findIoc).not.toHaveBeenCalled();
    expect(dependencies.setCachedLookup).not.toHaveBeenCalled();

    await app.close();
  });

  it("queries PostgreSQL and caches a found IOC on cache miss", async () => {
    const ioc: IocRecord = {
      type: "sha256",
      value: "a".repeat(64),
      source: "manual",
      score: 95,
      added_at: "2026-05-15T00:00:00.000Z",
    };
    const dependencies = createDependencies({
      findIoc: vi.fn(async () => ioc),
    });
    const app = buildApp({ dependencies });

    const response = await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "sha256",
        value: "a".repeat(64),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ verdict: "malicious", ioc });
    expect(dependencies.setCachedLookup).toHaveBeenCalledWith(
      { type: "sha256", value: "a".repeat(64) },
      { verdict: "malicious", ioc },
      600,
    );

    await app.close();
  });

  it("caches unknown lookup results with the negative TTL", async () => {
    const dependencies = createDependencies();
    const app = buildApp({ dependencies });

    const response = await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "ip",
        value: "127.0.0.1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ verdict: "unknown" });
    expect(dependencies.setCachedLookup).toHaveBeenCalledWith(
      { type: "ip", value: "127.0.0.1" },
      { verdict: "unknown" },
      60,
    );

    await app.close();
  });

  it("writes IOC upserts to PostgreSQL before invalidating Redis", async () => {
    const events: string[] = [];
    const dependencies = createDependencies({
      upsertIoc: vi.fn(async (input) => {
        events.push("postgres");

        return {
          ...input,
          added_at: "2026-05-15T00:00:00.000Z",
        };
      }),
      invalidateCachedLookup: vi.fn(async () => {
        events.push("redis");
      }),
    });
    const app = buildApp({ dependencies });

    const response = await app.inject({
      method: "POST",
      url: "/ioc",
      payload: {
        type: "domain",
        value: "example.com",
        source: "manual",
        score: 80,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(events).toEqual(["postgres", "redis"]);
    expect(dependencies.invalidateCachedLookup).toHaveBeenCalledWith({
      type: "domain",
      value: "example.com",
      source: "manual",
      score: 80,
    });

    await app.close();
  });

  it("exposes Prometheus metrics", async () => {
    const app = buildApp({ dependencies: createDependencies() });

    await app.inject({
      method: "POST",
      url: "/lookup",
      payload: {
        type: "domain",
        value: "example.com",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("iocheck_http_requests_total");
    expect(response.body).toContain("iocheck_http_request_duration_seconds_bucket");
    expect(response.body).toContain("iocheck_http_in_flight_requests");
    expect(response.body).toContain('iocheck_lookup_total{type="domain",verdict="unknown"}');
    expect(response.body).toContain("process_cpu_seconds_total");

    await app.close();
  });
});

describe("config", () => {
  it("uses port 3000 by default", () => {
    expect(loadConfig({})).toMatchObject({
      port: 3000,
      redisUrl: "redis://localhost:6379",
      iocCacheTtlSeconds: 600,
      iocNegativeCacheTtlSeconds: 60,
    });
  });

  it("reads PORT from the environment", () => {
    expect(loadConfig({ PORT: "4000" }).port).toBe(4000);
  });

  it("reads Redis cache configuration from the environment", () => {
    expect(
      loadConfig({
        REDIS_URL: "redis://redis:6379",
        IOC_CACHE_TTL_SECONDS: "300",
        IOC_NEGATIVE_CACHE_TTL_SECONDS: "30",
      }),
    ).toMatchObject({
      redisUrl: "redis://redis:6379",
      iocCacheTtlSeconds: 300,
      iocNegativeCacheTtlSeconds: 30,
    });
  });
});
