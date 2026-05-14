import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

const HTTP_ROUTES = ["/healthz", "/readyz", "/lookup", "/ioc"] as const;
const HTTP_METHODS = ["GET", "POST"] as const;
const HTTP_STATUS_CODES = ["200", "201", "400", "404", "500"] as const;
const IOC_TYPES = ["ip", "domain", "sha256"] as const;
const LOOKUP_VERDICTS = ["malicious", "unknown"] as const;
const STATUSES = ["success", "failure"] as const;
const POSTGRES_OPERATIONS = ["lookup", "upsert", "health_check"] as const;
const REDIS_OPERATIONS = ["get", "set", "invalidate", "health_check"] as const;
const CACHE_RESULTS = ["hit", "miss"] as const;

type IocTypeLabel = (typeof IOC_TYPES)[number];
type StatusLabel = (typeof STATUSES)[number];
type PostgresOperationLabel = (typeof POSTGRES_OPERATIONS)[number];
type RedisOperationLabel = (typeof REDIS_OPERATIONS)[number];
type CacheResultLabel = (typeof CACHE_RESULTS)[number];

interface MetricsRequest {
  method: string;
  url: string;
}

interface MetricsReply {
  statusCode: number;
}

interface MetricsHookRegistrar {
  addHook(
    hookName: "onRequest",
    hook: (request: MetricsRequest) => Promise<void> | void,
  ): void;
  addHook(
    hookName: "onResponse",
    hook: (request: MetricsRequest, reply: MetricsReply) => Promise<void> | void,
  ): void;
}

const requestStartTimes = new WeakMap<object, bigint>();
const requestRoutes = new WeakMap<object, string>();

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
});

export const httpRequestsTotal = new Counter({
  name: "iocheck_http_requests_total",
  help: "Total HTTP requests handled by method, route, and status code.",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "iocheck_http_request_duration_seconds",
  help: "HTTP request duration in seconds by method, route, and status code.",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpInFlightRequests = new Gauge({
  name: "iocheck_http_in_flight_requests",
  help: "Current in-flight HTTP requests by route.",
  labelNames: ["route"] as const,
  registers: [metricsRegistry],
});

export const lookupTotal = new Counter({
  name: "iocheck_lookup_total",
  help: "Total IOC lookup outcomes by IOC type and verdict.",
  labelNames: ["type", "verdict"] as const,
  registers: [metricsRegistry],
});

export const iocUpsertsTotal = new Counter({
  name: "iocheck_ioc_upserts_total",
  help: "Total IOC upsert outcomes by IOC type and status.",
  labelNames: ["type", "status"] as const,
  registers: [metricsRegistry],
});

export const validationFailuresTotal = new Counter({
  name: "iocheck_validation_failures_total",
  help: "Total request validation failures by route.",
  labelNames: ["route"] as const,
  registers: [metricsRegistry],
});

export const postgresQueryDurationSeconds = new Histogram({
  name: "iocheck_postgres_query_duration_seconds",
  help: "PostgreSQL query duration in seconds by operation.",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [metricsRegistry],
});

export const postgresQueriesTotal = new Counter({
  name: "iocheck_postgres_queries_total",
  help: "Total PostgreSQL query outcomes by operation and status.",
  labelNames: ["operation", "status"] as const,
  registers: [metricsRegistry],
});

export const postgresPoolConnections = new Gauge({
  name: "iocheck_postgres_pool_connections",
  help: "PostgreSQL pool connections by state.",
  labelNames: ["state"] as const,
  registers: [metricsRegistry],
});

export const redisOperationsTotal = new Counter({
  name: "iocheck_redis_operations_total",
  help: "Total Redis operation outcomes by operation and status.",
  labelNames: ["operation", "status"] as const,
  registers: [metricsRegistry],
});

export const redisOperationDurationSeconds = new Histogram({
  name: "iocheck_redis_operation_duration_seconds",
  help: "Redis operation duration in seconds by operation.",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [metricsRegistry],
});

export const cacheRequestsTotal = new Counter({
  name: "iocheck_cache_requests_total",
  help: "Total cache request outcomes by result and IOC type.",
  labelNames: ["result", "type"] as const,
  registers: [metricsRegistry],
});

function initializeMetrics(): void {
  for (const route of HTTP_ROUTES) {
    httpInFlightRequests.set({ route }, 0);
    validationFailuresTotal.inc({ route }, 0);

    for (const method of HTTP_METHODS) {
      for (const statusCode of HTTP_STATUS_CODES) {
        httpRequestsTotal.inc({ method, route, status_code: statusCode }, 0);
        httpRequestDurationSeconds.zero({ method, route, status_code: statusCode });
      }
    }
  }

  for (const type of IOC_TYPES) {
    for (const verdict of LOOKUP_VERDICTS) {
      lookupTotal.inc({ type, verdict }, 0);
    }

    for (const status of STATUSES) {
      iocUpsertsTotal.inc({ type, status }, 0);
    }

    for (const result of CACHE_RESULTS) {
      cacheRequestsTotal.inc({ result, type }, 0);
    }
  }

  for (const operation of POSTGRES_OPERATIONS) {
    postgresQueryDurationSeconds.zero({ operation });

    for (const status of STATUSES) {
      postgresQueriesTotal.inc({ operation, status }, 0);
    }
  }

  for (const state of ["total", "idle", "waiting"] as const) {
    postgresPoolConnections.set({ state }, 0);
  }

  for (const operation of REDIS_OPERATIONS) {
    redisOperationDurationSeconds.zero({ operation });

    for (const status of STATUSES) {
      redisOperationsTotal.inc({ operation, status }, 0);
    }
  }
}

function routeLabelForUrl(url: string): string {
  return url.split("?", 1)[0] || "unknown";
}

export function recordValidationFailure(route: string): void {
  validationFailuresTotal.inc({ route });
}

export function recordLookup(type: string, verdict: "malicious" | "unknown"): void {
  lookupTotal.inc({ type, verdict });
}

export function recordIocUpsert(type: string, status: "success" | "failure"): void {
  iocUpsertsTotal.inc({ type, status });
}

export function recordPostgresQuery(
  operation: PostgresOperationLabel,
  status: StatusLabel,
  durationSeconds: number,
): void {
  postgresQueriesTotal.inc({ operation, status });
  postgresQueryDurationSeconds.observe({ operation }, durationSeconds);
}

export function setPostgresPoolConnections(metrics: {
  total: number;
  idle: number;
  waiting: number;
}): void {
  postgresPoolConnections.set({ state: "total" }, metrics.total);
  postgresPoolConnections.set({ state: "idle" }, metrics.idle);
  postgresPoolConnections.set({ state: "waiting" }, metrics.waiting);
}

export function recordRedisOperation(
  operation: RedisOperationLabel,
  status: StatusLabel,
  durationSeconds: number,
): void {
  redisOperationsTotal.inc({ operation, status });
  redisOperationDurationSeconds.observe({ operation }, durationSeconds);
}

export function recordCacheRequest(result: CacheResultLabel, type: IocTypeLabel): void {
  cacheRequestsTotal.inc({ result, type });
}

export function registerMetricsInstrumentation(app: MetricsHookRegistrar): void {
  app.addHook("onRequest", async (request) => {
    const route = routeLabelForUrl(request.url);

    if (route === "/metrics") {
      return;
    }

    requestRoutes.set(request, route);
    requestStartTimes.set(request, process.hrtime.bigint());
    httpInFlightRequests.inc({ route });
  });

  app.addHook("onResponse", async (request, reply) => {
    const route = requestRoutes.get(request);
    const startedAt = requestStartTimes.get(request);

    if (!route || !startedAt) {
      return;
    }

    const method = request.method;
    const statusCode = String(reply.statusCode);
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    httpInFlightRequests.dec({ route });
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe({ method, route, status_code: statusCode }, durationSeconds);
  });
}

initializeMetrics();
