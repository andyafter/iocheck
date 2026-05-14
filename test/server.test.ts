import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/index.js";

describe("app", () => {
  it("builds a Fastify instance", async () => {
    const app = buildApp();

    expect(app.server).toBeDefined();

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
