# iocheck

Minimal Node.js and TypeScript service scaffold for an IOC checking API.

## Current Status

- Fastify server bootstrap is in place.
- Pino logging is configured through Fastify.
- The server reads `PORT` from the environment and defaults to `3000`.
- Basic `/healthz`, `/readyz`, `/lookup`, and `/ioc` routes are implemented.
- IOC request validation is handled with Zod.
- PostgreSQL local Docker deployment and the first IOC table migration are defined.
- No cache, Kubernetes, metrics, or autoscaling are implemented yet.



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

## Side Notes

1. Postgresql is deployed locally in Docker ONLY because I want to make this demo flexible, in real production env, I will NEVER use docker when it comes to data storages. 