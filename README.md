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

`helm-install` installs KEDA if missing, builds the image in Minikube, and applies the SQL migration.

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
```

In another terminal, install Locust and run against the printed URL:

```sh
cd load-tests
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
locust -f locustfile.py --host http://127.0.0.1:<port>
```

Open the Locust web UI and run with users=500, ramp-up=10–20, duration=1500s.

See `load-tests/README.md` for scenarios and result notes.

## Notes

- PostgreSQL and Redis run as single pods for demo reproducibility; production would use managed services.
- Uses `IOCHECK_DATABASE_URL` (not `DATABASE_URL`) to avoid clobbering other local databases.
