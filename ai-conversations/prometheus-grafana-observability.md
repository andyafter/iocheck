# Prometheus and Grafana Observability Conversation Summary

This is a condensed summary of the Cursor conversation used to decide, implement, and debug Prometheus and Grafana observability for `iocheck`. It intentionally summarizes tool calls, code changes, and verification steps instead of copying the full transcript.

## 1. Deciding What to Track in Prometheus

User request:

- Study the `iocheck` codebase and assignment.
- Recommend what the service should track in Prometheus.

Summary of work:

- Inspected the repository structure, current `README.md`, Helm chart, Fastify routes, PostgreSQL migration, and roadmap notes in `docs/progress.md`.
- Confirmed the service is a TypeScript/Fastify IOC checking API with `/healthz`, `/readyz`, `/lookup`, and `/ioc`.
- Noted that the Helm chart already deployed Prometheus, but the app had no `/metrics` endpoint yet.
- Recommended metrics grouped into:
  - HTTP request volume, latency, and in-flight requests.
  - IOC lookup and upsert business metrics.
  - Validation failures.
  - PostgreSQL, Redis, and cache metrics for later implementation.
  - Node.js runtime metrics from `prom-client`.
  - Autoscaling signals such as in-flight requests and lookup request rate.

Important decisions:

- Do not label metrics with IOC values, IPs, domains, hashes, request IDs, or client IPs, because those would create high-cardinality metrics.
- Prefer workload-oriented autoscaling signals over CPU, because this API is likely IO-bound and can have high latency while CPU remains low.
- Use Prometheus as the metrics store/query layer and Grafana as the dashboard layer.

## 2. Documenting the Metric Plan

User request:

- Put the recommended metrics into `docs/PROMETHUS_METRICS.md` using the existing heading-and-description style.

Summary of work:

- Updated `docs/PROMETHUS_METRICS.md` with concise entries for:
  - `iocheck_http_requests_total`
  - `iocheck_http_request_duration_seconds_bucket`
  - `iocheck_http_in_flight_requests`
  - `iocheck_lookup_total`
  - `iocheck_ioc_upserts_total`
  - `iocheck_validation_failures_total`
  - PostgreSQL, Redis, cache, autoscaling, and runtime metrics.
- Later notes also included Kubernetes/HPA evidence metrics, such as container CPU and HPA desired/current replica gauges.

Tool and command summary:

- Read the metrics doc and applied a patch to append the remaining metric sections.
- Ran diagnostics/lint checks for the edited Markdown file.

## 3. Implementing Prometheus Metrics in the App

User request:

- Implement the metrics so they can be seen on the Prometheus page.

Summary of code changes:

- Installed `prom-client`.
- Added `src/metrics/index.ts` to define and register:
  - custom IOC API counters, histograms, and gauges
  - default Node.js process/runtime metrics
  - helper functions for lookup, upsert, validation, DB, Redis, cache, and pool metrics
- Added `src/routes/metrics.ts` exposing `GET /metrics` in Prometheus text exposition format.
- Updated `src/app.ts` to register metrics instrumentation and the metrics route.
- Updated `src/routes/ioc.ts` so:
  - successful `/lookup` increments `iocheck_lookup_total`
  - successful `/ioc` increments `iocheck_ioc_upserts_total`
  - validation errors increment `iocheck_validation_failures_total`
- Updated tests in `test/server.test.ts` to verify `/metrics` returns Prometheus output and includes expected metric names.

Tool and command summary:

- Used file reads to inspect app, route, test, TypeScript, and lint setup.
- Used patches to add the metrics module and route.
- Ran:
  - `npm install prom-client`
  - `npm run build`
  - `npm run test`
  - `npm run lint`
- Fixed one TypeScript issue around Fastify logger generics by narrowing the instrumentation helper to the hook surface it needs instead of requiring a full `FastifyInstance` type.

Verification result:

- Build, tests, and lint passed.
- Prometheus could scrape app metrics after the app was redeployed and pods were restarted.

## 4. Updating Minikube and Debugging Prometheus Visibility

User questions:

- How to update the local Minikube cluster.
- Why the Prometheus page looked empty.
- How to see data in Prometheus.

Summary of troubleshooting:

- Checked Kubernetes pods, services, and endpoints in the `iocheck` namespace.
- Found that the cluster was still running old app pods that returned `404` for `/metrics`.
- Ran `make helm-upgrade`, then discovered Kubernetes did not restart the app pods because the image tag stayed `latest` and the pod template did not change.
- Restarted the app deployment so Minikube would run the freshly rebuilt image.
- Verified from inside the Prometheus pod that `http://iocheck:3000/metrics` returned both Node.js runtime metrics and custom `iocheck_*` metrics.
- Verified Prometheus targets were `UP`.
- Queried Prometheus directly for `iocheck_http_requests_total` and confirmed it returned series.

Important operational notes:

- Prometheus starts visually empty until a query is executed.
- Prometheus scrapes every 15 seconds, so fresh requests may not appear immediately.
- With `image.tag=latest`, `helm upgrade` alone may not roll pods. A rollout restart may be needed:

```sh
make helm-upgrade
kubectl rollout restart deployment/iocheck --namespace iocheck
```

Useful Prometheus queries from the conversation:

```promql
iocheck_http_requests_total
```

```promql
iocheck_lookup_total
```

```promql
process_cpu_seconds_total{job="iocheck"}
```

## 5. Adding Grafana for Dashboards

User request:

- Add Grafana to the repo so the project can have dashboard-style graphs like the screenshot.

Summary of code changes:

- Added Grafana support to the local Helm chart using the same lightweight in-repo template style as Prometheus.
- Added:
  - `helm/iocheck/templates/grafana-secret.yaml`
  - `helm/iocheck/templates/grafana-service.yaml`
  - `helm/iocheck/templates/grafana-configmap.yaml`
  - `helm/iocheck/templates/grafana-deployment.yaml`
- Updated `_helpers.tpl` with a Grafana naming helper.
- Updated `helm/iocheck/values.yaml` with Grafana image, admin credentials, service settings, and resources.
- Provisioned a Grafana Prometheus datasource pointing to `http://iocheck-prometheus:9090`.
- Provisioned an `iocheck API` dashboard with panels for:
  - request rate by route
  - p95/p99 request latency
  - in-flight requests
  - lookup verdicts
  - app CPU
  - app memory
- Updated `Makefile` with:
  - `make grafana-url`
  - `make grafana-forward`
- Updated `README.md` and Helm notes with Grafana access instructions.

Tool and command summary:

- Inspected existing Helm templates and values.
- Used patches to add Grafana Kubernetes resources and dashboard provisioning.
- Ran:
  - `helm template`
  - `helm lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint`

Verification result:

- Helm templates rendered successfully.
- Helm lint passed.
- App build, tests, and lint continued to pass.

## 6. Debugging Empty Grafana Panels

User issue:

- Grafana dashboard loaded but panels showed `No data` and a `Failed to fetch` toast.

Summary of troubleshooting:

- Checked `kubectl get pods,svc --namespace iocheck` and confirmed Grafana, Prometheus, app, and PostgreSQL pods were running.
- Checked Grafana logs and confirmed:
  - datasource provisioning succeeded
  - dashboard provisioning succeeded
  - Grafana was trying to reach external plugin/update URLs, but those external failures were unrelated to the local dashboard data path
- Verified from inside the Grafana pod that it could query Prometheus at `http://iocheck-prometheus:9090`.
- Verified Prometheus had `iocheck_http_requests_total` data.
- Found that local browser requests to `http://127.0.0.1:3001/api/health` failed, which matched the Grafana `Failed to fetch` toast.
- Started or restarted the Grafana port-forward:

```sh
make grafana-forward
```

Outcome:

- The dashboard problem was not missing Prometheus data. It was the local Grafana port-forward/browser connection failing.
- Once `http://127.0.0.1:3001/api/health` returned Grafana health JSON, the browser dashboard could query Grafana again.

## 7. Normal Lookup Response During Metric Generation

User question:

- A manual lookup request returned `{"verdict":"unknown"}`. Is that normal?

Answer:

- Yes. That response means the `/lookup` request succeeded.
- The current lookup flow returns `unknown` unless a matching malicious IOC has been stored and the DB-backed lookup behavior is active.
- The request still increments metrics such as:
  - `iocheck_http_requests_total`
  - `iocheck_lookup_total`

Example traffic command:

```sh
kubectl exec --namespace iocheck deploy/iocheck-prometheus -- \
  wget -qO- --header='Content-Type: application/json' \
  --post-data='{"type":"ip","value":"1.1.1.1"}' \
  http://iocheck:3000/lookup
```

## Final State From This Conversation

- The app exposes Prometheus metrics at `/metrics`.
- Prometheus scrapes the app in Minikube.
- Grafana is deployed by the Helm chart.
- Grafana is automatically provisioned with:
  - a Prometheus datasource
  - an `iocheck API` dashboard
- The README and Makefile include local commands to open Prometheus and Grafana.
- The main operational gotchas are:
  - restart app pods when using `latest`
  - keep `make grafana-forward` running while viewing Grafana
  - wait for Prometheus scrape intervals before expecting fresh metrics to appear
