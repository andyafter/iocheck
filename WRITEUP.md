# iocheck Writeup

`iocheck` is a small threat-intelligence lookup service for IPs, domains, and SHA-256 hashes. It runs locally on Minikube and is designed to show why an IO-heavy API should autoscale on request pressure instead of CPU.

Everything needed for the demo lives in this repository: TypeScript source, Dockerfile, Helm chart, Makefile, README, database seed tooling, and Locust load tests.

## Architecture

```text
client
  |
  v
Kubernetes Service (NodePort)
  |
  v
iocheck Deployment, 2-4 replicas
  Fastify + Pino + Zod + prom-client
  /healthz /readyz /lookup /ioc /metrics
  |
  +--> Redis StatefulSet: read-through cache
  |
  +--> PostgreSQL StatefulSet: source of truth

Prometheus scrapes per-pod /metrics.
Grafana shows API, dependency, and autoscaling signals.
KEDA reads Prometheus and drives the HPA from lookup RPS.
```

The main entry point is `make helm-install`. It builds the image, installs the Helm chart, applies the Postgres init SQL, waits for Postgres, and seeds generated IOC rows for local load testing.

## API And Data Flow

- `POST /lookup` validates the IOC with Zod, checks Redis first, then falls back to Postgres. Hits return `{ verdict: "malicious", ioc }`; misses return `{ verdict: "unknown" }`.
- `POST /ioc` upserts an IOC into Postgres and invalidates the matching Redis key so the next lookup repopulates the cache.
- `GET /healthz` is a simple liveness check.
- `GET /readyz` checks Postgres with `SELECT 1` and Redis with `PING`; it returns `503` if either dependency is unavailable.
- `GET /metrics` exposes Prometheus metrics.

Postgres is the source of truth because the core query is a compound-key lookup by `(type, value)`, and the service also needs reliable upsert semantics plus metadata like `source`, `score`, and `added_at`.

Redis is a read-through cache using keys like `ioc:{type}:{value}`. Known malicious responses use `IOC_CACHE_TTL_SECONDS=600`; unknown responses use `IOC_NEGATIVE_CACHE_TTL_SECONDS=60`. The short negative TTL helps absorb repeated alert-storm lookups for unknown indicators without hiding newly inserted IOCs for too long.

Redis failures are treated as non-fatal on the lookup path: the error is logged and the request falls through to Postgres.

## Autoscaling Choice

The final autoscaler is KEDA + Prometheus. The trigger is:

```promql
sum(rate(iocheck_http_requests_total{route="/lookup"}[1m]))
```

The threshold is `75` lookup requests per second per replica. Current bounds are:

- `minReplicas: 2`, matching the PodDisruptionBudget `minAvailable: 2`.
- `maxReplicas: 4`, to avoid adding API pods faster than the Postgres connection pool can support.

Scale behavior is intentionally conservative:

- Scale up by at most `+1 pod per 30s`.
- Scale down with a `120s` stabilization window.
- KEDA polls Prometheus every `15s`, matching the scrape interval.

I also considered `iocheck_http_in_flight_requests` as the primary signal. It is a strong IO-pressure metric, but lookup RPS is easier to reason about as capacity per pod and easier to explain during review. In-flight requests are still useful on the Grafana dashboard.

## Why Not CPU HPA?

The service is IO-bound. Under lookup-heavy load, the app spends much of its time waiting on Redis or Postgres rather than burning CPU. That means latency can get bad before CPU crosses a typical HPA threshold.

In one CPU-HPA contrast run, lookup RPS rose from roughly baseline traffic to about 10x, while p99 latency became multi-second. CPU stayed below the 70% target for long enough that the HPA did not help in time. The useful leading signals were request rate, in-flight requests, event-loop lag, and p99 latency.

In a sharper burst test, CPU HPA did add pods, but load did not immediately spread evenly. Kubernetes Service balancing is connection-oriented, so existing TCP connections can keep sending traffic to the original pods after new pods become ready. New replicas help future connections, but they do not magically move existing ones.

The app itself is safe to run across replicas because it has no local request state; Redis and Postgres hold shared state. The remaining load-sharing concern is at the client/service boundary. In tests, this can be improved by increasing client-side connection parallelism, closing connections between requests, or using an L7 proxy/Ingress for per-request balancing.

## Observability

Prometheus scrapes:

- App metrics from each pod via Kubernetes pod discovery.
- cAdvisor CPU metrics to compare against CPU-HPA behavior.
- kube-state-metrics for HPA current/desired replica decisions.

Grafana includes panels for request rate, lookup p95/p99, in-flight requests, lookup verdicts, app CPU/memory, event-loop lag, per-pod lookup RPS, HPA replica decisions, and Redis/Postgres latency.

The key point is that the autoscaling input is visible. A reviewer can compare lookup RPS, replica count, latency, and dependency latency on the same dashboard.

## Reproduction

Clean setup:

```sh
make minikube-start
make helm-install
make status
```

Port-forward useful services:

```sh
make app-forward
make prometheus-forward
make grafana-forward
```

Run the default load test:

```sh
make load-test
```

Watch autoscaling:

```sh
kubectl get hpa,scaledobject,pods -n iocheck --watch
```

Switch autoscaler modes:

```sh
make autoscale-hpa
make autoscale-keda
make autoscaler-status
```

During a KEDA run, the expected shape is:

1. Lookup RPS rises in Prometheus.
2. KEDA marks the `ScaledObject` active.
3. Replicas step from 2 toward 4.
4. Per-pod lookup RPS becomes more balanced.
5. After traffic stops, replicas return to 2 after cooldown/stabilization.

For evidence collection during an HPA contrast run:

```sh
make capture-evidence
```

That writes HPA descriptions, events, pod CPU, autoscaler YAML, and a short replica timeline under `docs/evidence/<timestamp>/`.

## Autoscaler Failure Modes

If Prometheus is down or KEDA cannot query it, the data path still works. The app, Redis, and Postgres keep serving traffic; only autoscaling decisions are affected.

The safest failure behavior is "do not change replicas" rather than "scale down aggressively." KEDA generally behaves that way on query errors. If Prometheus is reachable but returns stale or empty data, the service may fall back toward `minReplicas`, so the chart keeps `minReplicas=2` as a baseline safety floor.

A production version should add alerting for broken metric ingestion and could add a high-threshold CPU fallback as a last-resort guardrail. I did not add that here because the assignment focus is on demonstrating why request pressure is the better primary signal.

## AI Conversations

Initial ChatGPT conversation:
https://chatgpt.com/share/6a0cab2b-a750-83ec-8ce7-5ba2f529a583

Build-related conversation notes:

- [Kubernetes and Helm planning](ai-conversations/kubernetes-helm-planning.md)
- [Kubernetes, Helm, and Minikube setup](ai-conversations/kubernetes-helm-minikube-setup.md)
- [General building steps conversation summary](ai-conversations/general-building-steps.md)
- [Database verification and seeding script](ai-conversations/database_verification_and_seeding.md)
- [Redis cache and Minikube verification](ai-conversations/redis-cache-and-minikube-verification.md)
- [Database verification and load testing setup](ai-conversations/database-load-testing-summary.md)
- [Redis cache usage check](ai-conversations/redis-cache-usage-check.md)
- [Kubernetes port-forward, Minikube checks, HPA helper commands](ai-conversations/kubernetes-port-forward-minikube-hpa-notes.md)
- [Assignment gap review and cache clarification](ai-conversations/assignment-gap-review.md)
- [Kubernetes load testing setup](ai-conversations/kubernetes-load-testing-setup.md)
- [Prometheus and Grafana observability setup](ai-conversations/prometheus-grafana-observability.md)