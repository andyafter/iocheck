# Load Tests

This folder contains Locust-based load tests for studying `iocheck` behavior over time.

The starter scenario is intentionally read-heavy:

- `POST /lookup` is the main request.
- `GET /healthz` and `GET /readyz` add light control-plane traffic.
- `GET /metrics` is available but disabled by default.
- `POST /ioc` is available but disabled by default so test runs do not mutate data unless you opt in.

## Setup

From the repository root:

```sh
python3 -m venv .venv-load
source .venv-load/bin/activate
python -m pip install -r load-tests/requirements.txt
```

Start the app separately, for example:

```sh
npm run dev
```

## Run The Starter Test

```sh
set -a
source load-tests/config/basic.env
set +a
locust --config load-tests/config/local.conf
```

The default run is headless with 10 users, 2 users per second spawn rate, and a 2 minute duration. It writes generated reports to `load-tests/results/latest*`, which are ignored by git.

To override the target URL for one run:

```sh
IOCHECK_BASE_URL=http://127.0.0.1:3000 locust --config load-tests/config/local.conf
```

For interactive Locust UI mode, remove or override headless:

```sh
locust -f load-tests/locustfile.py --host http://127.0.0.1:3000
```

## Configuration

Edit `load-tests/config/basic.env` for scenario behavior:

- `IOCHECK_WAIT_MIN_SECONDS` and `IOCHECK_WAIT_MAX_SECONDS` control per-user pacing.
- `IOCHECK_LOOKUP_WEIGHT`, `IOCHECK_HEALTHZ_WEIGHT`, `IOCHECK_READYZ_WEIGHT`, `IOCHECK_METRICS_WEIGHT`, and `IOCHECK_UPSERT_WEIGHT` control the traffic mix.
- `IOCHECK_LOOKUP_IPS`, `IOCHECK_LOOKUP_DOMAINS`, and `IOCHECK_LOOKUP_SHA256S` control lookup data.
- `IOCHECK_GENERATED_SEED_COUNT` adds generated lookup values matching `seed-001.bad-ioc.example`, `10.66.0.1`, and equivalent SHA-256 rows through that count.
- `IOCHECK_WRITE_ENABLED=true` allows `POST /ioc` traffic when `IOCHECK_UPSERT_WEIGHT` is above `0`.

Edit `load-tests/config/local.conf` for Locust runner settings:

- `users`
- `spawn-rate`
- `run-time`
- `html`
- `csv`

## Recording Results

Use `load-tests/results/TEMPLATE.md` to manually record each case and outcome. Commit the markdown notes when they are useful. Generated CSV and HTML reports stay local by default.

Suggested flow:

```sh
cp load-tests/results/TEMPLATE.md load-tests/results/2026-05-15-baseline-local.md
```
