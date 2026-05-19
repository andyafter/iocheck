# Kubernetes local setup, HPA helpers, and port-forward (conversation summary)

Condensed notes from a Cursor chat about Minikube, Metrics Server, HPA smoke checks, verifying the local machine, and accessing Prometheus/Grafana/the app from the host. No full transcript — only outcomes and commands.

## 1. What three commands do (Metrics Server + Helm + watch HPA)

| Command | Purpose |
|--------|---------|
| `minikube addons enable metrics-server` | Installs Metrics Server so the cluster exposes pod CPU/memory metrics HPA needs. |
| `make helm-upgrade` | Rebuilds the app image (Minikube) and `helm upgrade --install` so chart changes (including HPA) apply. |
| `kubectl get hpa --namespace iocheck --watch` | Streams HPA status: targets, current utilization, min/max replicas, current replicas. |

No code edits were made in this sub-thread; this was explanation only.

## 2. Checking Docker and Minikube (“everything we need”)

**Commands run (conceptually):** `docker ps`, `minikube status`, `kubectl get nodes`, `kubectl get … --namespace iocheck`, `helm status …`, `kubectl get deployment metrics-server -n kube-system`.

**Result at check time:**

- **Docker:** Daemon OK; **no running containers** (empty `docker ps`).
- **Minikube:** **Stopped** (control plane / kubelet / apiserver not running).
- **`kubectl` / Helm:** Failed with **connection refused** to the kubeconfig API URL — expected while Minikube is down.

**Implication:** Namespace workloads, HPA object, and Metrics Server could not be validated until the cluster was started again. Suggested recovery flow: `make minikube-start` → `minikube addons enable metrics-server` → `make helm-upgrade` → `make status`.

## 3. Port-forward Prometheus, Grafana, and the app

**Makefile targets** (each blocks; use separate terminals; defaults `RELEASE=iocheck`, `NAMESPACE=iocheck`):

| Target | Local URL |
|--------|-----------|
| `make app-forward` | `http://127.0.0.1:3000` |
| `make prometheus-forward` | `http://127.0.0.1:9090` |
| `make grafana-forward` | `http://127.0.0.1:3001` |

**Equivalent `kubectl`:**

```sh
kubectl port-forward --namespace iocheck svc/iocheck 3000:3000
kubectl port-forward --namespace iocheck svc/iocheck-prometheus 9090:9090
kubectl port-forward --namespace iocheck svc/iocheck-grafana 3001:3000
```

**Grafana:** default login documented in repo README (`admin` / `admin`).

## 4. Earlier context in the same thread (HPA in Helm)

In an earlier part of the conversation (not reprinted here), work added **HorizontalPodAutoscaler** to `helm/iocheck`: new template `app-hpa.yaml`, `autoscaling` values, Deployment omits `replicas` when autoscaling is enabled, Makefile `status` includes `hpa`, README note on Metrics Server. Chart version was bumped. **`helm lint`** and **`helm template`** were used to validate renders.

---

*If this file moves, update the relative link from `WRITEUP.md` accordingly.*
