import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/index.js";

describe("app", () => {
  it("builds a Fastify instance", async () => {
    const app = buildApp();

    expect(app.server).toBeDefined();

    await app.close();
  });

  it("returns health status", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("returns readiness status", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });

    await app.close();
  });

  it("returns unknown for a valid lookup", async () => {
    const app = buildApp();

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
    const app = buildApp();

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
    const app = buildApp();

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
    const app = buildApp();

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
});

describe("config", () => {
  it("uses port 3000 by default", () => {
    expect(loadConfig({}).port).toBe(3000);
  });

  it("reads PORT from the environment", () => {
    expect(loadConfig({ PORT: "4000" }).port).toBe(4000);
  });
});
