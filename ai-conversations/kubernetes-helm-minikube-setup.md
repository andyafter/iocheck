# Kubernetes, Helm, and Minikube Setup Conversation Summary

This is a condensed summary of the Cursor conversation used to add the first Kubernetes and Helm demo setup for `iocheck`. It intentionally summarizes tool calls, generated files, and code changes instead of copying the full chat transcript.

## 1. Assignment and Existing Database Setup Review

User request:

- Understand the upstream `iocheck` assignment.
- Understand the existing `database/` folder and database setup.
- Add Kubernetes and Helm support using Minikube.
- Containerize the TypeScript service.
- Deploy PostgreSQL separately as one pod with persistent memory/storage.
- Deploy Prometheus as one pod for later monitoring.

Summary of findings:

- The assignment requires a TypeScript IOC lookup service with `/lookup`, `/ioc`, `/healthz`, `/readyz`, and `/metrics`.
- The assignment also expects Kubernetes manifests or Helm, probes, resource requests and limits, a cache, autoscaling, load testing, and a writeup.
- The local project already had a Fastify TypeScript service listening on `PORT`, defaulting to `3000`.
- The database setup used PostgreSQL 16 through `database/docker-compose.yml`.
- Existing migrations lived in `database/migrations/001_create_iocs.sql`.
- Local configuration used `IOCHECK_DATABASE_URL` to avoid accidentally using an unrelated `DATABASE_URL`.

Tool and command summary:

- Fetched the upstream GitLab assignment README.
- Read `package.json`, `README.md`, `src/app.ts`, `src/server.ts`, `src/config/index.ts`, `src/routes/health.ts`, `src/routes/ioc.ts`, `src/db/postgres.ts`, `.env.example`, `database/docker-compose.yml`, and the migration SQL.
- Used search/glob tools to confirm there was no existing Dockerfile, Helm chart, or Makefile at that point.

## 2. Docker Image for the TypeScript Service

Summary of work:

- Added a production `Dockerfile`.
- Used a multi-stage Node 20 Alpine build:
  - install dependencies with `npm ci`
  - compile TypeScript with `npm run build`
  - copy only production dependencies and `dist/` into the runtime image
- Added `.dockerignore` to keep `.env`, `node_modules`, generated build output, and local seed-script state out of the image context.

Important implementation decisions:

- Kept the container entrypoint aligned with the existing app: `node dist/server.js`.
- Exposed port `3000`, matching the app default and Kubernetes service target.
- Ran the final container as the built-in `node` user.

Tool and command summary:

- Used patch edits to add `Dockerfile` and `.dockerignore`.
- Later verified the image definition with `docker build -t iocheck:local .`.

## 3. Initial Helm Chart for the Demo Stack

Summary of work:

- Created a Helm chart for the local demo stack.
- Added Kubernetes resources for:
  - the `iocheck` app Deployment and Service
  - a PodDisruptionBudget for the app
  - PostgreSQL as a single-replica StatefulSet
  - a PostgreSQL Service, Secret, ConfigMap, and PVC-backed volume claim
  - Prometheus as a single-replica Deployment
  - a Prometheus Service and ConfigMap
- Added liveness, readiness, and startup probes for the app, PostgreSQL, and Prometheus.
- Added resource requests and limits for every container.
- Added a `values.yaml` file so CPU, memory, storage, image tags, service ports, and replica counts can be changed easily.

Important implementation decisions:

- App defaults to two replicas so traffic can be shared and the app PDB can use `minAvailable: 2`.
- PostgreSQL is exactly one pod for the local demo and uses a persistent volume claim.
- Prometheus is exactly one pod for later metrics work.
- The app receives `IOCHECK_DATABASE_URL` through a Kubernetes Secret.
- The chart does not yet implement the full assignment's cache, `/metrics`, or autoscaling requirements.

Tool and command summary:

- Used patch edits to add Helm templates and `values.yaml`.
- Rendered the chart with `helm template`.
- Linted the chart with `helm lint`.
- Checked TypeScript with `npm run build`.
- Checked IDE diagnostics after the file edits.

## 4. Makefile and README Demo Workflow

Summary of work:

- Added a `Makefile` with common demo commands:
  - start Minikube
  - build the app image inside Minikube
  - install or upgrade the Helm release
  - uninstall the release
  - inspect Kubernetes status
  - get local service URLs
- Updated `README.md` with the Minikube and Helm setup flow.
- Documented where to adjust app, database, and Prometheus resources.

Important implementation decisions:

- Used `minikube image build` so another demo machine can build the image directly into the Minikube image store without pushing to a registry.
- Used NodePort services for simple local demo access.
- Added `make status` to show pods, services, PVCs, and PDBs in one command.

Tool and command summary:

- Used patch edits for `Makefile` and `README.md`.
- Used `make -n` checks to verify generated Makefile commands.
- Checked linter diagnostics on edited files.

## 5. Reusing the Existing Database Migration

User follow-up:

- Avoid keeping a second migration file under the chart.
- Rename the chart root folder from `charts/` to `helm/`.

Summary of work:

- Renamed the chart path from `charts/iocheck` to `helm/iocheck`.
- Removed the duplicated SQL file from the chart.
- Changed the PostgreSQL init ConfigMap template to require `postgres.initSql`.
- Updated `make helm-install` to pass the existing migration file with:

```sh
--set-file postgres.initSql=database/migrations/001_create_iocs.sql
```

- Updated the README to refer to `helm/iocheck/values.yaml`.

Important implementation decisions:

- Kept `database/migrations/001_create_iocs.sql` as the single source of truth for the initial database schema.
- Used Helm's `--set-file` instead of copying the SQL into the chart.
- Made the chart fail clearly if `postgres.initSql` is not provided.

Tool and command summary:

- Renamed the folder with a shell command.
- Deleted the duplicated chart SQL file.
- Removed empty chart file directories.
- Re-rendered the chart with `helm template iocheck helm/iocheck --set-file postgres.initSql=database/migrations/001_create_iocs.sql`.
- Re-linted the chart with `helm lint helm/iocheck --set-file postgres.initSql=database/migrations/001_create_iocs.sql`.
- Confirmed there were no remaining `charts/` files.

## 6. macOS Minikube Service URL Clarification

User follow-up:

- Running `make app-url` printed a local `http://127.0.0.1:<port>` URL and the message:
  - "Because you are using a Docker driver on darwin, the terminal needs to be open to run it."
- The command appeared stuck.

Summary of explanation:

- This is expected on macOS when Minikube uses the Docker driver.
- `minikube service --url` opens a tunnel and keeps the terminal attached.
- The printed URL works only while that terminal remains open.

Summary of work:

- Added `make app-forward`, which runs:

```sh
kubectl port-forward --namespace iocheck svc/iocheck 3000:3000
```

- Added `make prometheus-forward`, which runs:

```sh
kubectl port-forward --namespace iocheck svc/iocheck-prometheus 9090:9090
```

- Updated the README to explain the Docker-driver tunnel behavior and document the port-forward workflow.

Tool and command summary:

- Read `Makefile` and the relevant `README.md` section.
- Patched `Makefile` and `README.md`.
- Verified the new Makefile targets with `make -n app-forward prometheus-forward app-url prometheus-url`.
- Checked linter diagnostics on the edited files.

## Final State After This Conversation

Files added or changed by this conversation included:

- `Dockerfile`
- `.dockerignore`
- `Makefile`
- `README.md`
- `helm/iocheck/Chart.yaml`
- `helm/iocheck/values.yaml`
- `helm/iocheck/templates/*`

Verification performed during the conversation:

- `npm run build`
- `docker build -t iocheck:local .`
- `helm template`
- `helm lint`
- `make -n` checks for helper targets
- IDE linter diagnostics on edited files

Remaining assignment work noted during the conversation:

- Add a real `/metrics` endpoint.
- Add a cache layer.
- Add workload-aware autoscaling.
- Add the reproducible load test and final evidence for the writeup.
