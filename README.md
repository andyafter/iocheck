# iocheck

Threat-intelligence lookup service for IP, domain, and SHA-256 IOCs. Fastify + TypeScript API backed by PostgreSQL and Redis, with a Helm chart that deploys Prometheus, Grafana, and KEDA autoscaling on Minikube.

See `WRITEUP.md` for architecture, autoscaling analysis, and the CPU-HPA vs KEDA comparison.

## Requirements

Docker, Python 3, Minikube, Helm, kubectl.

## Minikube + Helm

```sh
make minikube-start
make helm-install
make status
```

Or

```sh
minikube delete --purge
docker rm -f minikube
make minikube-start
```

`helm-install` installs KEDA and kube-state-metrics if missing, builds the image in Minikube, applies the SQL migration, waits for Postgres, and seeds 1000 generated IOC rows for local load testing.

Port-forward and smoke test:

```sh
make app-forward
curl http://127.0.0.1:3000/healthz
curl -X POST http://127.0.0.1:3000/lookup \
  -H "content-type: application/json" \
  -d '{"type":"ip","value":"8.8.8.8"}'
```

Prometheus: `make prometheus-forward` → `http://127.0.0.1:9090`
Grafana: `make grafana-forward` → `http://127.0.0.1:3001` (admin / admin)

## Grafana Metrics

![iocheck Grafana dashboard](docs/assets/grafana-dashboard.png)

- **Request Rate by Route** (`sum by (route) (rate(iocheck_http_requests_total[1m]))`): Requests per second for each API route. Use this to see traffic volume and whether load is mostly hitting `/lookup`, `/healthz`, `/readyz`, or `/ioc`.
- **/lookup Latency (p95 / p99)** (`histogram_quantile` over `iocheck_http_request_duration_seconds_bucket`): Tail latency for lookup requests. p95 means 95% of lookups are faster than this value; p99 shows the slowest 1% and is useful for spotting spikes.
- **In-Flight Requests by Pod** (`iocheck_http_in_flight_requests{route="/lookup"}`): Current active `/lookup` requests per pod. High values mean the IO-bound API is busy or requests are queueing.
- **Lookup Verdicts** (`sum by (verdict) (iocheck_lookup_total)`): Count of lookup results by verdict. This shows how many IOCs were classified as `malicious` vs `unknown`.
- **HPA CPU Signal (% of request)** (`container_cpu_usage_seconds_total`, `kube_horizontalpodautoscaler_status_target_metric`, `kube_horizontalpodautoscaler_spec_target_metric`): Compares actual container CPU, the CPU value HPA reports, and the HPA target. This explains why CPU-based HPA does or does not scale.
- **App Memory** (`process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`): Memory used by each app pod. RSS is total process memory; heap used is the active V8 JavaScript heap.
- **Running iocheck Pods** (`count(up{job="iocheck"} == 1)`): Number of app pods Prometheus can scrape successfully. This is the quick health/replica count in the dashboard.
- **CPU by Pod (% of requests)** (`rate(process_cpu_seconds_total[2m])` divided by the configured CPU request): Per-pod Node.js CPU usage as a percentage of the Kubernetes CPU request. This helps spot uneven load or a hot pod.
- **Event Loop Lag by Pod** (`nodejs_eventloop_lag_seconds`): Delay in the Node.js event loop. Higher lag means the runtime is saturated or blocked, even if CPU is not very high.
- **/lookup RPS by Pod** (`sum by (pod) (rate(iocheck_http_requests_total{route="/lookup"}[1m]))`): Lookup requests per second handled by each pod. KEDA uses lookup RPS as the scaling signal, so this panel shows whether load is balanced across replicas.
- **HPA Replica Decision** (`kube_horizontalpodautoscaler_status_current_replicas`, `kube_horizontalpodautoscaler_status_desired_replicas`, `count(up{job="iocheck"} == 1)`): Current replicas, desired replicas, and actually ready pods. This shows what the autoscaler wants versus what is running.
- **Lookup p99 vs Dependency p99** (`histogram_quantile` over lookup, Redis `get`, and PostgreSQL `lookup` histograms): Compares end-to-end lookup latency with Redis and PostgreSQL latency. If dependency p99 rises with lookup p99, the bottleneck is likely Redis or Postgres.

## Seed Example IOCs

Port-forward the Postgres pod in one terminal:

```sh
kubectl port-forward -n iocheck svc/iocheck-postgres 5433:5432
```

In another terminal, point the seed script at it and apply the initial batch:

```sh
cd database/seed
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo "IOCHECK_DATABASE_URL=postgres://iocheck:iocheck@localhost:5433/iocheck" > .env
python seed.py apply initial_seed
```

For more details on the seeding, refer to the README.md in database/seed.

For a larger lookup set, seed generated IOCs directly into the in-cluster database:

```sh
make seed-load-data
```

By default this creates 1000 total rows split across IPs, domains, and SHA-256 hashes. The values match the generated lookup data enabled in `load-tests/config/basic.env` by `IOCHECK_GENERATED_SEED_ROWS=1000`.

## Autoscaling

KEDA scales on `sum(rate(iocheck_http_requests_total{route="/lookup"}[1m]))` with a default threshold of 75 rps/replica (`minReplicas: 2`, `maxReplicas: 4`).

Check which autoscaler is active:

```sh
make autoscaler-status
```

Sample output (KEDA mode):

```
Autoscaler mode: KEDA (Prometheus-based, scales on lookup RPS per pod)
...
TRIGGERS=prometheus   TARGETS=0/75 (avg)
```

### Switching between KEDA and CPU HPA

The Challenge 1 comparison runs the same Locust burst against both modes. Switch with:

```sh
make autoscale-hpa     # CPU HPA, target 70%, min=2, max=8
make autoscale-keda    # KEDA on lookup RPS, threshold 75 rps/pod, min=2, max=4
```

Verify the switch took effect:

```sh
make autoscaler-status
```

Watch scaling in real time during a load test:

```sh
kubectl get hpa,scaledobject,pods -n iocheck --watch
```

Tune via `helm/iocheck/values.yaml` (`resources`, `autoscaling`, `postgres`, `prometheus`, `grafana`).

## Load Testing

Get the app URL (keep the tunnel terminal open):

```sh
make app-url

# or 
minikube service iocheck -n iocheck --url
```

In another terminal, install Locust and run against the printed URL:

```sh
cd load-tests
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
locust -f locustfile.py --host http://127.0.0.1:<port>
```

Open the Locust web UI and run with users=500, ramp-up=10–20, duration=1500s.

The default Locust environment mixes generated seeded values with generated unknown values. To change how many seeded records Locust targets, edit `IOCHECK_GENERATED_SEED_ROWS` in `load-tests/config/basic.env` and seed the same count with:

```sh
make seed-load-data LOAD_SEED_ROWS=1000
```

Right now you might need to vibe code a bit in order for the locust to actually fetch the real data in the database for certain percentage, otherwise the API call will always fetch unknown records. 

`IOCHECK_LOOKUP_HIT_WEIGHT` and `IOCHECK_LOOKUP_MISS_WEIGHT` control the seeded/unknown lookup mix.

See `load-tests/README.md` for scenarios and result notes.

## Notes

- PostgreSQL and Redis run as single pods for demo reproducibility; production would use managed services.
- Uses `IOCHECK_DATABASE_URL` (not `DATABASE_URL`) to avoid clobbering other local databases.
