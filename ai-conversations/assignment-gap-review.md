# Assignment Gap Review Conversation Summary

This is a condensed summary of a Cursor conversation about comparing the local `iocheck` repository against the public assignment requirements. It intentionally summarizes tool calls, inspected code, and decisions instead of copying the full raw transcript.

## User Request

The user asked to scan the existing repository, compare it with the public assignment at:

https://gitlab.com/strongkeep-public/iocheck

and briefly identify which steps were still missing.

## Assignment Requirements Reviewed

The AI fetched and summarized the public assignment README. Important requirements identified:

- TypeScript threat-intel lookup service.
- API endpoints:
  - `POST /lookup`
  - `POST /ioc`
  - `GET /healthz`
  - `GET /readyz`
  - `GET /metrics`
- Persistent store with lookup/upsert by `(type, value)`.
- Cache layer chosen by the implementer, with read-through behavior, sensible TTL, and invalidation on upsert.
- Local Kubernetes deployment with service, database, cache, probes, PDB, resource requests and limits, and autoscaling.
- Evidence-based explanation of why CPU-based HPA is wrong for this workload.
- Reproducible load test proving scale up and scale down.
- README, writeup, load test tooling, and AI chat logs.

## Repository Files Inspected

The AI inspected the local project structure and key files, including:

- `README.md`
- `Makefile`
- `package.json`
- `src/app.ts`
- `src/routes/ioc.ts`
- `src/routes/health.ts`
- `src/routes/metrics.ts`
- `src/metrics/index.ts`
- `src/db/postgres.ts`
- `database/docker-compose.yml`
- `database/migrations/001_create_iocs.sql`
- `helm/iocheck/values.yaml`
- `helm/iocheck/templates/app-deployment.yaml`
- `helm/iocheck/templates/prometheus-configmap.yaml`
- `load-tests/locustfile.py`
- `load-tests/README.md`
- `docs/PROMETHUS_METRICS.md`
- `docs/progress.md`
- `test/server.test.ts`

The AI also searched for autoscaling, HPA, Redis, readiness probes, liveness probes, startup probes, and PodDisruptionBudget references.

## Tool and Command Summary

The AI used repository search and file-read tools to inspect source, Helm templates, docs, tests, and load test files.

The AI fetched the public GitLab README and used it as the source of truth for assignment requirements.

The AI ran:

```sh
npm run build && npm test
```

Result:

- TypeScript build passed.
- Vitest test suite passed.
- `test/server.test.ts` reported 10 passing tests.

## Findings About Current Implementation

The AI found that the project already had:

- Fastify app bootstrap.
- Pino logging.
- Basic route registration.
- Zod request validation.
- Temporary `POST /lookup` and `POST /ioc` behavior.
- `GET /healthz` and `GET /readyz`.
- `GET /metrics` using `prom-client`.
- Prometheus metrics definitions for HTTP, lookup, IOC upsert, Postgres, Redis, and cache labels.
- PostgreSQL migration defining the `iocs` table with primary key `(type, value)`.
- Dockerfile.
- Helm chart for app, PostgreSQL, Prometheus, and Grafana.
- App probes, resource requests and limits, and PodDisruptionBudget.
- Locust starter load test.

The AI found these gaps:

- `POST /lookup` still returned `unknown` and was not connected to PostgreSQL.
- `POST /ioc` still returned temporary echoed data and did not persist to PostgreSQL.
- `GET /readyz` always returned ready and did not check database or cache connectivity.
- No actual cache implementation existed yet.
- Kubernetes and docker-compose did not include a cache service.
- No HPA, KEDA `ScaledObject`, Prometheus Adapter, or equivalent autoscaler existed.
- No reproducible load-test evidence existed yet for baseline, burst, p95/p99, CPU behavior, or replica scale up/down.
- `WRITEUP.md` and AI conversation artifacts still needed to fully document the challenge answers and development process.

## Cache and Redis Clarification

The user then asked whether Redis was mandatory or whether the AI had invented that requirement.

The AI clarified:

- Redis is not mandatory.
- A cache layer is mandatory.
- The assignment says the cache implementation is the author's choice.
- The assignment requires read-through behavior, sensible TTL, and invalidation on upsert.
- The platform requirements also imply the cache should be represented in Kubernetes because they ask for manifests for "your DB, your cache."

The AI explained that Redis is a common and defensible implementation choice, but alternatives such as Memcached or another cache layer could also satisfy the requirement if justified.

## Final Outcome

The conversation produced a concise gap list for the project and clarified that Redis is an implementation option, not a hard assignment requirement. The key requirement is to implement and justify a real cache layer, then wire it into readiness checks, Kubernetes deployment, load testing, and the writeup.
