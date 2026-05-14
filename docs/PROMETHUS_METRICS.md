# App Metrics

## iocheck_http_requests_total{method,route,status_code}
Count all API traffic, especially /lookup, /ioc, /healthz, /readyz. Exclude /metrics to avoid scrape noise.

## iocheck_http_request_duration_seconds_bucket{method,route,status_code}
Histogram for latency. This is what lets you query p95/p99 during load tests.

## iocheck_http_in_flight_requests{route}
Gauge for current concurrency. This is a strong autoscaling signal for an IO-bound API where CPU may stay low while requests queue.

## iocheck_lookup_total{type,verdict}
Count lookup outcomes: malicious vs unknown, split by ip, domain, sha256.

## iocheck_ioc_upserts_total{type,status}
Count IOC writes and whether they succeeded or failed.

## iocheck_validation_failures_total{route}
Useful because bad requests currently return 400; you want to separate client errors from real service failures.

## iocheck_postgres_query_duration_seconds_bucket{operation}
Histogram for PostgreSQL query latency, split by operation such as lookup, upsert, and health_check.

## iocheck_postgres_queries_total{operation,status}
Count PostgreSQL queries and whether they succeeded or failed.

## iocheck_postgres_pool_connections{state}
Gauge for PostgreSQL pool connections, especially total, idle, and waiting connections.

## iocheck_redis_operations_total{operation,status}
Count Redis get, set, invalidate, and health_check operations and whether they succeeded or failed.

## iocheck_redis_operation_duration_seconds_bucket{operation}
Histogram for Redis operation latency, split by operation.

## iocheck_cache_requests_total{result,type}
Count cache hits and misses for lookup requests, split by IOC type.

# Autoscaling Metrics

## iocheck_http_in_flight_requests{route}
Primary autoscaling signal because it reflects queued or active work better than CPU for an IO-bound API.

## rate(iocheck_http_requests_total{route="/lookup"}[1m])
Useful secondary autoscaling signal for lookup request throughput.

## histogram_quantile(0.95, rate(iocheck_http_request_duration_seconds_bucket{route="/lookup"}[5m]))
Useful SLO and load-test signal for p95 lookup latency.

## histogram_quantile(0.99, rate(iocheck_http_request_duration_seconds_bucket{route="/lookup"}[5m]))
Useful SLO and load-test signal for p99 lookup latency.

# Runtime Metrics

## process_cpu_seconds_total
Default Node.js process metric for CPU usage over time.

## process_resident_memory_bytes
Default Node.js process metric for total resident memory usage.

## nodejs_heap_size_used_bytes
Default Node.js metric for used V8 heap memory.

## nodejs_eventloop_lag_seconds
Default Node.js metric for event loop delay, useful for detecting runtime saturation.

## nodejs_gc_duration_seconds_bucket
Default Node.js histogram for garbage collection duration.

