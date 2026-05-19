# Database Verification and Load Testing Conversation Summary

This is a condensed summary of the Cursor conversation covering local database inspection and the first Locust load-test setup for `iocheck`. It records the important requests, findings, file changes, and verification steps without copying the full transcript or raw command output.

## 1. Local Database Inspection

User request:

- Connect to the local `iocheck` PostgreSQL database.
- Read all application data because the database was expected to be small.

Summary of work:

- Connected to PostgreSQL using the local `IOCHECK_DATABASE_URL` provided by the user.
- Listed database relations and filtered out PostgreSQL system catalogs.
- Identified one application table: `public.iocs`.
- Inspected the `iocs` schema:
  - `type text not null`
  - `value text not null`
  - `source text not null`
  - `score integer not null`
  - `added_at timestamptz not null default now()`
  - primary key on `(type, value)`
  - check constraint restricting `type` to `ip`, `domain`, or `sha256`
  - check constraint restricting `score` to `0..100`
- Counted 5 IOC rows.
- Read and summarized all rows:
  - two domains
  - two IPs
  - one SHA-256 hash
  - scores ranged from `0` to `100`

Tool and command summary:

- Used `psql` to list tables.
- Used `psql` to inspect `public.iocs`.
- Used `psql` to count and read rows.
- Summarized the results in chat instead of exporting a full database dump.

## 2. Starter Locust Load Tests

User request:

- Create a folder for load testing.
- Use Locust for the first load test.
- Keep the setup simple and easily configurable.
- Design it so future versions of load tests can be added.
- Add a place to manually log test cases and results for studying load and system behavior.

Summary of work:

- Inspected the project structure, `README.md`, `Makefile`, and API route files.
- Confirmed the available routes:
  - `GET /healthz`
  - `GET /readyz`
  - `GET /metrics`
  - `POST /lookup`
  - `POST /ioc`
- Created a new `load-tests/` directory.
- Added a configurable Locust starter test in `load-tests/locustfile.py`.
- Made the default traffic mix read-heavy:
  - `POST /lookup` as the main request
  - light `GET /healthz` and `GET /readyz` traffic
  - optional `GET /metrics`
  - optional `POST /ioc` writes, disabled by default
- Added environment-driven controls for:
  - base URL
  - user wait time
  - traffic weights
  - lookup datasets
  - write enablement
  - upsert source and score
- Added Locust runner configuration in `load-tests/config/local.conf`.
- Added scenario configuration in `load-tests/config/basic.env`.
- Added manual result tracking files:
  - `load-tests/results/README.md`
  - `load-tests/results/TEMPLATE.md`
- Added `load-tests/results/.gitignore` so generated Locust CSV and HTML reports stay local, while markdown notes can be committed.
- Added `load-tests/requirements.txt` with the Locust dependency.
- Updated the repository `README.md` with setup and run instructions.
- Updated the `Makefile` with:
  - `make load-test-install`
  - `make load-test`
- Updated `.gitignore` to ignore `.venv-load/`.

Important implementation decisions:

- Writes are disabled by default to avoid mutating the IOC database during normal baseline tests.
- Traffic weights are configured with environment variables so scenarios can be adjusted without editing Python code.
- Generated load-test artifacts are ignored by default; durable observations should be recorded as markdown notes.
- The load-test folder is structured so future scenarios can be added beside the starter test and documented independently.

Tool and command summary:

- Used file reads and glob searches to inspect the repo and route files.
- Used shell commands to create the load-test directories.
- Used patches to add the Locust files, result templates, `Makefile` targets, README instructions, and `.gitignore` update.
- Ran `python3 -m py_compile load-tests/locustfile.py` to verify the Locust script syntax.
- Checked editor diagnostics for changed files and found no linter errors.
- Checked git status to confirm the modified and newly added files.
