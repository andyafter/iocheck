# Kubernetes and Helm Planning Conversation Summary

This is a condensed summary of the Cursor/ChatGPT conversation about preparing `iocheck` for a Kubernetes and Helm demo. It records the important decisions and tool usage without copying the full transcript.

## User Goal

The user asked to understand the upstream `iocheck` assignment and the current local database setup before making Kubernetes or Helm changes.

The desired demo setup was:

- containerize the TypeScript backend service
- run the database separately with configurable CPU and memory resources
- satisfy the assignment requirement for a `PodDisruptionBudget` with `minAvailable >= 2`
- decide whether an nginx/gateway layer is needed
- decide whether Prometheus should run as its own pod

## Assignment Context

The upstream assignment asks for a threat-intelligence lookup service that runs on local Kubernetes and can autoscale correctly under bursty, read-heavy traffic.

Important platform requirements discussed:

- Dockerfile for the TypeScript service
- Kubernetes manifests or Helm chart
- Deployment and Service for the API
- separate database and cache
- liveness, readiness, and startup probes
- resource requests and limits on every container
- `PodDisruptionBudget` with `minAvailable >= 2`
- autoscaling based on a workload-relevant signal rather than only CPU

## Current Database Setup

The local repository already had a simple PostgreSQL setup:

- `database/docker-compose.yml` starts `postgres:16-alpine`
- local credentials default to `iocheck` / `iocheck`
- migrations are mounted into `/docker-entrypoint-initdb.d`
- `database/migrations/001_create_iocs.sql` creates the `iocs` table
- the `iocs` table uses `(type, value)` as the primary key
- seed scripts live under `database/seed/`

The database schema supports the assignment's required lookup/upsert pattern by storing:

- IOC `type`
- IOC `value`
- `source`
- `score`
- `added_at`

## Gateway Decision

We decided that nginx or another gateway is not required for the local assignment demo.

A Kubernetes `Service` in front of the backend `Deployment` is enough to distribute API traffic across ready backend pods. An Ingress controller such as nginx would only be useful if the demo needed host-based routing, TLS, browser-friendly URLs, or more realistic edge routing.

For this project, a normal Kubernetes Service plus `kubectl port-forward`, `NodePort`, or Minikube service access is simpler and sufficient.

## Prometheus Pod Decision

We decided that Prometheus should run as its own pod if the project will use Prometheus metrics for monitoring or autoscaling.

The backend service should expose `GET /metrics` in Prometheus exposition format. Prometheus can scrape that endpoint, and an autoscaler such as KEDA or an HPA backed by custom metrics can use those metrics later.

This matches the assignment hint that CPU-based autoscaling is not enough for this workload.

## Backend Replica Decision

The backend service should start with two pods:

```yaml
replicaCount: 2

autoscaling:
  minReplicas: 2
  maxReplicas: 8
```

Reasoning:

- the assignment requires `PodDisruptionBudget minAvailable >= 2`
- `minReplicas: 2` keeps at least two API pods available during normal operation
- two pods also lets the demo show that the Kubernetes Service shares load
- `maxReplicas: 8` gives enough room to demonstrate scale-up and scale-down during load tests

## Suggested Target Architecture

The recommended local demo architecture was:

- API service: multiple backend pods behind one Kubernetes Service
- Postgres: separate stateful database workload with configurable CPU, memory, and storage
- Redis/cache: separate service when implementing the assignment cache requirement
- Prometheus: separate monitoring pod
- Autoscaler: KEDA or HPA with custom metrics from Prometheus
- PDB: applied to API pods with `minAvailable: 2`

## Tool Call Summary

Tool calls were used only to gather context before answering:

- fetched the public GitLab assignment page
- read `database/README.md`
- read `database/docker-compose.yml`
- read `database/migrations/001_create_iocs.sql`
- read `database/seed/README.md`
- listed repository files with a glob search

No code edits were made during this part of the conversation.
