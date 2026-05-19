# iocheck

Threat-intelligence lookup service for IP, domain, and SHA-256 IOCs. The app exposes a Fastify API backed by PostgreSQL and Redis, ships with local Docker and Minikube deployment paths, and demonstrates KEDA autoscaling from Prometheus request-rate metrics.

## Current Status

- Fastify + TypeScript API with Pino logging and graceful shutdown.
- `GET /healthz`, `GET /readyz`, `GET /metrics`, `POST /lookup`, and `POST /ioc` routes are implemented.
- Zod validates IOC request bodies for `ip`, `domain`, and `sha256` lookups/upserts.
- PostgreSQL stores IOC records with a plain SQL migration and local Docker support.
- Redis provides read-through lookup caching, short negative caching, and invalidate-on-write for `/ioc`.
- Prometheus metrics cover HTTP traffic, latency, in-flight requests, lookup outcomes, cache hits/misses, Redis operations, and PostgreSQL query/pool behavior.
- The Helm chart deploys the API, PostgreSQL, Redis, Prometheus, Grafana, a PodDisruptionBudget, and KEDA autoscaling.
- Grafana is pre-provisioned with a Prometheus datasource and an `iocheck API` dashboard for per-pod load, latency, in-flight requests, pod count, and CPU.
- Locust load tests live under `load-tests/` for baseline and burst simulations.
- `WRITEUP.md` contains the architecture rationale, autoscaling analysis, measured CPU-HPA failure mode, and next-step production tradeoffs.

## Requirements

- Node.js 20+
- npm
- Docker
- Python 3 and `pip`
- Minikube
- Helm
- kubectl

For the Kubernetes demo, `make helm-install` installs KEDA into the cluster if it is not already present.

## Project Notes

- `WRITEUP.md` explains the design choices, challenge answers, and autoscaling proof.
- `database/README.md` covers local PostgreSQL, migrations, reset commands, and seed data.
- `load-tests/README.md` covers Locust setup, scenario knobs, and result recording.

## Commands

```sh
npm install
npm run dev
npm run build
npm start
npm run lint
npm run test
```

## Load Testing

Locust load tests live in `load-tests/`. The starter scenario is configurable with `load-tests/config/basic.env` and records manual study notes under `load-tests/results/`.

```sh
python3 -m venv .venv-load
source .venv-load/bin/activate
python -m pip install -r load-tests/requirements.txt

set -a
source load-tests/config/basic.env
set +a
locust --config load-tests/config/local.conf
```

Or, after installing Locust:

```sh
make load-test
```

## Local PostgreSQL

Database files live in `database/`. This repo uses plain SQL migration files and the official PostgreSQL and Redis Docker images for local development.

```sh
cp .env.example .env
docker compose --env-file .env -f database/docker-compose.yml up -d postgres redis
docker compose --env-file .env -f database/docker-compose.yml exec postgres psql -U iocheck -d iocheck -c "\d iocs"
```

On first startup with a fresh Docker volume, PostgreSQL runs the SQL files mounted from `database/migrations/` in filename order. If you already have an old local volume, remove it with `docker compose --env-file .env -f database/docker-compose.yml down -v` before recreating the database.

See `database/README.md` for the database layout, reset commands, and seed script usage.

To load the default example IOCs after PostgreSQL is running:

```sh
cd database/seed
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed.py apply initial_seed
```

## Configuration

```sh
PORT=3000
IOCHECK_DATABASE_URL=postgres://iocheck:iocheck@localhost:5433/iocheck
REDIS_URL=redis://localhost:6379
IOC_CACHE_TTL_SECONDS=600
IOC_NEGATIVE_CACHE_TTL_SECONDS=60
```

This project uses `IOCHECK_DATABASE_URL` instead of the generic `DATABASE_URL` to avoid accidentally connecting to another local database.

## Minikube + Helm Demo Stack

The Helm chart in `helm/iocheck/` deploys:

- the `iocheck` TypeScript service as a Kubernetes Deployment and Service
- a KEDA `ScaledObject` for the `iocheck` API pods, backed by Prometheus
- PostgreSQL as one StatefulSet pod with a persistent volume claim
- Redis as one StatefulSet pod with a persistent volume claim
- Prometheus as one Deployment pod with per-pod scraping for the app
- Grafana as one Deployment pod with a pre-provisioned Prometheus datasource and `iocheck API` dashboard

Prerequisites:

```sh
minikube version
helm version
kubectl version --client
```

Start Minikube, build the app image inside Minikube, and install the chart:

```sh
make minikube-start
make helm-install
make status
```

The install target installs KEDA, builds the image inside Minikube, and injects the existing migration at `database/migrations/001_create_iocs.sql` into the Postgres init ConfigMap with Helm's `--set-file` flag.

On macOS with Minikube's Docker driver, `minikube service --url` opens a tunnel and keeps the terminal attached. You can use these targets, but leave that terminal open while you test from another terminal:

```sh
make app-url
make prometheus-url
make grafana-url
```

For a simpler local demo, use Kubernetes port-forwarding instead:

```sh
make app-forward
```

Then smoke test the service from another terminal:

```sh
curl http://127.0.0.1:3000/healthz
curl -X POST http://127.0.0.1:3000/lookup \
  -H "content-type: application/json" \
  -d '{"type":"ip","value":"8.8.8.8"}'
```

Prometheus can be forwarded the same way:

```sh
make prometheus-forward
```

Then open `http://127.0.0.1:9090`.

Grafana can be forwarded on a separate local port:

```sh
make grafana-forward
```

Then open `http://127.0.0.1:3001` and log in with `admin` / `admin`. The chart provisions Prometheus as the default datasource and adds an `iocheck API` dashboard under the `iocheck` folder.

Change Kubernetes resources and storage in `helm/iocheck/values.yaml`:

- app CPU/memory: `resources`
- app autoscaling: `autoscaling`
- database CPU/memory: `postgres.resources`
- database persistent storage size: `postgres.persistence.size`
- Prometheus CPU/memory: `prometheus.resources`
- Grafana CPU/memory and admin credentials: `grafana`

The chart enables KEDA autoscaling for the app by default with `minReplicas: 2`, `maxReplicas: 6`, and this Prometheus query:

```sh
sum(rate(iocheck_http_requests_total{route="/lookup"}[1m]))
```

The default threshold is `75` lookup requests per second per replica. Watch autoscaling during load tests with:

```sh
kubectl get hpa,scaledobject,pods --namespace iocheck --watch
```

When autoscaling is enabled, the Deployment leaves replica count ownership to KEDA/HPA. PostgreSQL, Prometheus, and Grafana each run as one pod by design for this local demo.

To reproduce the CPU-based HPA contrast from the writeup, switch the chart to CPU HPA and re-run the same burst:

```sh
make autoscale-hpa
```

Switch back to the Prometheus-backed KEDA scaler with:

```sh
make autoscale-keda
```

## Side Notes

1. PostgreSQL and Redis are deployed locally only to keep the demo reproducible. In a production environment, these would be managed data services or separately operated infrastructure rather than single demo pods/containers.