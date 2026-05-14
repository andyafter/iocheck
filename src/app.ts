import Fastify from "fastify";
import pino from "pino";

export function buildApp() {
  const logger = pino({ name: "iocheck" });

  return Fastify({
    loggerInstance: logger,
  });
}
