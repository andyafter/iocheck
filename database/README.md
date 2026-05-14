# Database

This folder contains the local PostgreSQL setup for `iocheck`.

- `docker-compose.yml` starts PostgreSQL for local development.
- `migrations/` contains plain SQL files mounted into the Postgres init directory.
- `seed/` contains optional scripts for loading local test data.

## Create the Local Database

From the repository root:

```sh
cp .env.example .env
docker compose --env-file .env -f database/docker-compose.yml up -d postgres
```

Verify the `iocs` table:

```sh
docker compose --env-file .env -f database/docker-compose.yml exec postgres \
  psql -U iocheck -d iocheck -c "\d iocs"
```

## How Migrations Run

For now, migrations are plain SQL files. The local Postgres container runs them only when a fresh database volume is created.

To rebuild the local database from scratch:

```sh
docker compose --env-file .env -f database/docker-compose.yml down -v
docker compose --env-file .env -f database/docker-compose.yml up -d postgres
```

This is intentionally simple for local development. If we need repeatable up/down migrations against an existing database, the next step should be adding a real migration runner such as `node-pg-migrate`.
