# iocheck

Minimal Node.js and TypeScript service scaffold for an IOC checking API.

## Current Status

- Fastify server bootstrap is in place.
- Pino logging is configured through Fastify.
- The server reads `PORT` from the environment and defaults to `3000`.
- Basic `/healthz`, `/readyz`, `/lookup`, and `/ioc` routes are implemented.
- IOC request validation is handled with Zod.
- PostgreSQL local Docker deployment and the first IOC table migration are defined.
- Redis read-through lookup caching is wired for IOC lookups.
- A Dockerfile and Minikube Helm chart are available for the demo stack.
- A starter Locust load-test setup is available under `load-tests/`.
- Kubernetes HPA autoscaling is available in the Helm chart for the API pods.



## Requirements

- Node.js 20+
- npm

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

Database files live in `database/`. This repo uses plain SQL migration files and the official PostgreSQL Docker image for local development.

```sh
cp .env.example .env
docker compose --env-file .env -f database/docker-compose.yml up -d postgres redis
docker compose --env-file .env -f database/docker-compose.yml exec postgres psql -U iocheck -d iocheck -c "\d iocs"
```

On first startup with a fresh Docker volume, PostgreSQL runs the SQL files mounted from `database/migrations/` in filename order. If you already have an old local volume, remove it with `docker compose --env-file .env -f database/docker-compose.yml down -v` before recreating the database.

See `database/README.md` for the database layout, reset commands, and seed script usage.

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
- a HorizontalPodAutoscaler for the `iocheck` API pods
- PostgreSQL as one StatefulSet pod with a persistent volume claim
- Redis as one StatefulSet pod with a persistent volume claim
- Prometheus as one Deployment pod for later service monitoring
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

The install target injects the existing migration at `database/migrations/001_create_iocs.sql` into the Postgres init ConfigMap with Helm's `--set-file` flag.

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

The chart enables HPA for the app by default with `minReplicas: 2`, `maxReplicas: 6`, and a CPU utilization target of 70%. Because Kubernetes resource-based HPA depends on the Metrics Server, enable it in Minikube before testing autoscaling:

```sh
minikube addons enable metrics-server
make helm-upgrade
kubectl get hpa --namespace iocheck --watch
```

When HPA is enabled, the Deployment leaves replica count ownership to the autoscaler. PostgreSQL, Prometheus, and Grafana each run as one pod by design for this local demo.

## Side Notes

1. Postgresql is deployed locally in Docker ONLY because I want to make this demo flexible, in real production env, I will NEVER use docker when it comes to data storages.