# iocheck

Minimal Node.js and TypeScript service scaffold for an IOC checking API.

## Current Status

- Fastify server bootstrap is in place.
- Pino logging is configured through Fastify.
- The server reads `PORT` from the environment and defaults to `3000`.
- Basic `/healthz`, `/readyz`, `/lookup`, and `/ioc` routes are implemented.
- IOC request validation is handled with Zod.
- PostgreSQL local Docker deployment and the first IOC table migration are defined.
- A Dockerfile and Minikube Helm chart are available for the demo stack.
- No cache, metrics endpoint, or autoscaling are implemented yet.



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

## Local PostgreSQL

Database files live in `database/`. This repo uses plain SQL migration files and the official PostgreSQL Docker image for local development.

```sh
cp .env.example .env
docker compose --env-file .env -f database/docker-compose.yml up -d postgres
docker compose --env-file .env -f database/docker-compose.yml exec postgres psql -U iocheck -d iocheck -c "\d iocs"
```

On first startup with a fresh Docker volume, PostgreSQL runs the SQL files mounted from `database/migrations/` in filename order. If you already have an old local volume, remove it with `docker compose --env-file .env -f database/docker-compose.yml down -v` before recreating the database.

See `database/README.md` for the database layout, reset commands, and seed script usage.

## Configuration

```sh
PORT=3000
IOCHECK_DATABASE_URL=postgres://iocheck:iocheck@localhost:5433/iocheck
```

This project uses `IOCHECK_DATABASE_URL` instead of the generic `DATABASE_URL` to avoid accidentally connecting to another local database.

## Minikube + Helm Demo Stack

The Helm chart in `helm/iocheck/` deploys:

- the `iocheck` TypeScript service as a Kubernetes Deployment and Service
- PostgreSQL as one StatefulSet pod with a persistent volume claim
- Prometheus as one Deployment pod for later service monitoring

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

Get local URLs:

```sh
make app-url
make prometheus-url
```

Smoke test the service:

```sh
APP_URL="$(make app-url)"
curl "$APP_URL/healthz"
curl -X POST "$APP_URL/lookup" \
  -H "content-type: application/json" \
  -d '{"type":"ip","value":"8.8.8.8"}'
```

Change Kubernetes resources and storage in `helm/iocheck/values.yaml`:

- app CPU/memory: `resources`
- database CPU/memory: `postgres.resources`
- database persistent storage size: `postgres.persistence.size`
- Prometheus CPU/memory: `prometheus.resources`

The chart defaults the app to two pods so traffic can be shared. PostgreSQL and Prometheus each run as one pod by design for this local demo.

## Side Notes

1. Postgresql is deployed locally in Docker ONLY because I want to make this demo flexible, in real production env, I will NEVER use docker when it comes to data storages.