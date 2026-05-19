# Kubernetes Load Testing Setup Conversation Summary

This is a condensed summary of a Cursor conversation about whether load testing is enough to validate the current Kubernetes setup for `iocheck`, and which APIs should be called. It intentionally omits the full transcript and keeps only the useful decisions, commands, and inspected code paths.

## User Question

The user wanted to know whether load testing would be enough to test the Kubernetes setup, and if so, which API or APIs should be called.

## Context Inspected

The assistant inspected the local repository rather than relying only on the public GitLab URL:

- `README.md`
- `helm/iocheck/values.yaml`
- `helm/iocheck/templates/app-service.yaml`
- `helm/iocheck/templates/app-deployment.yaml`
- `src/app.ts`
- `src/routes/health.ts`
- `src/routes/ioc.ts`
- `src/routes/metrics.ts`
- `src/schemas/ioc.ts`
- `load-tests/locustfile.py`
- `load-tests/README.md`
- `load-tests/config/basic.env`
- `load-tests/config/local.conf`
- `database/migrations/001_create_iocs.sql`

## Findings

The Helm chart exposes the app on port `3000`, with a `NodePort` value of `30080` in the default values. The Deployment configures Kubernetes probes against:

- `GET /healthz` for liveness and startup checks
- `GET /readyz` for readiness checks

The app registers these runtime routes:

- `GET /healthz`
- `GET /readyz`
- `POST /lookup`
- `POST /ioc`
- `GET /metrics`

The existing Locust setup is already designed around a read-heavy workload. By default it sends mostly `POST /lookup` requests, with light `GET /healthz` and `GET /readyz` traffic. `GET /metrics` and `POST /ioc` are available in the Locust file but disabled by default.

## Recommendation

Load testing is useful, but it is not enough by itself to prove the Kubernetes setup is correct. The recommended order was:

1. Check Kubernetes objects, pod health, HPA, PDB, and events.
2. Smoke test the app through port-forwarding or the Minikube service URL.
3. Run the existing Locust load test.
4. Watch HPA behavior separately, making sure Metrics Server is enabled.

The most important API for realistic load testing is:

```sh
POST /lookup
```

Example request:

```sh
curl -X POST http://127.0.0.1:3000/lookup \
  -H "content-type: application/json" \
  -d '{"type":"ip","value":"8.8.8.8"}'
```

Other valid lookup payloads:

```json
{"type":"domain","value":"evil-phishing-login.com"}
{"type":"domain","value":"example.com"}
{"type":"sha256","value":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
```

Health and readiness endpoints should be included lightly:

```sh
GET /healthz
GET /readyz
```

`POST /ioc` should not be load tested unless data mutation is intentional, because it writes IOC records:

```json
{
  "type": "domain",
  "value": "test.example.com",
  "source": "load-test",
  "score": 50
}
```

`GET /metrics` is mainly for Prometheus scraping and should not be a heavy part of the load test.

## Commands Mentioned

Basic Kubernetes checks:

```sh
kubectl get pods,svc,hpa,pdb -n iocheck
kubectl get events -n iocheck --sort-by=.lastTimestamp
```

Port-forward the app:

```sh
make app-forward
```

Smoke test:

```sh
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/readyz
curl -X POST http://127.0.0.1:3000/lookup \
  -H "content-type: application/json" \
  -d '{"type":"ip","value":"8.8.8.8"}'
```

Run the existing load test:

```sh
make load-test
```

Enable Metrics Server and watch HPA:

```sh
minikube addons enable metrics-server
kubectl get hpa -n iocheck --watch
```

## Caveat

The default Locust scenario reuses a small set of lookup values. That is good for testing service routing, cache behavior, probes, and basic autoscaling, but it may not put sustained pressure on PostgreSQL after Redis cache warmup. For database pressure testing, use many unique lookup values or intentionally enable controlled `POST /ioc` traffic.
