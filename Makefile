RELEASE ?= iocheck
NAMESPACE ?= iocheck
KEDA_NAMESPACE ?= keda
KSM_NAMESPACE ?= kube-system
CHART ?= helm/iocheck
IMAGE ?= iocheck
TAG ?= latest
POSTGRES_INIT_SQL ?= database/migrations/001_create_iocs.sql
LOAD_TEST_ENV ?= load-tests/config/basic.env
LOAD_TEST_CONFIG ?= load-tests/config/local.conf
EVIDENCE_DIR ?= docs/evidence
EVIDENCE_SECONDS ?= 60
LOAD_SEED_ROWS ?= 1000

.PHONY: minikube-start image keda-install kube-state-metrics-install metrics-server-enable helm-install helm-upgrade helm-uninstall autoscale-hpa autoscale-keda autoscaler-status status app-url prometheus-url grafana-url app-forward prometheus-forward grafana-forward wait-postgres seed-load-data load-test-install load-test capture-evidence

minikube-start:
	minikube start

image:
	minikube image build -t $(IMAGE):$(TAG) .

keda-install:
	helm repo add kedacore https://kedacore.github.io/charts
	helm repo update kedacore
	helm upgrade --install keda kedacore/keda \
		--namespace $(KEDA_NAMESPACE) \
		--create-namespace
	kubectl wait --for=condition=Established crd/scaledobjects.keda.sh --timeout=90s

# kube-state-metrics powers the HPA-decision panels on the Grafana dashboard
# (current/target utilization, current/desired replicas). Without it, the
# "what did the HPA actually see and decide" panels stay empty.
kube-state-metrics-install:
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
	helm repo update prometheus-community
	helm upgrade --install kube-state-metrics prometheus-community/kube-state-metrics \
		--namespace $(KSM_NAMESPACE) \
		--create-namespace

helm-install: keda-install kube-state-metrics-install image
	helm upgrade --install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set image.repository=$(IMAGE) \
		--set image.tag=$(TAG) \
		--set-file postgres.initSql=$(POSTGRES_INIT_SQL)
	$(MAKE) wait-postgres
	$(MAKE) seed-load-data

helm-upgrade: helm-install

helm-uninstall:
	helm uninstall $(RELEASE) --namespace $(NAMESPACE)

metrics-server-enable:
	minikube addons enable metrics-server

autoscale-hpa: metrics-server-enable
	helm upgrade $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--reuse-values \
		--set autoscaling.type=hpa \
		--set autoscaling.minReplicas=2 \
		--set autoscaling.maxReplicas=8 \
		--set autoscaling.targetCPUUtilizationPercentage=70

autoscale-keda:
	helm upgrade $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--reuse-values \
		--set autoscaling.type=keda \
		--set autoscaling.minReplicas=2 \
		--set autoscaling.maxReplicas=4 \
		--set autoscaling.targetCPUUtilizationPercentage=null

status:
	kubectl get pods,svc,pvc,pdb,hpa,scaledobject --namespace $(NAMESPACE)

autoscaler-status:
	@if kubectl get scaledobject $(RELEASE) --namespace $(NAMESPACE) >/dev/null 2>&1; then \
		echo "Autoscaler mode: KEDA (Prometheus-based, scales on lookup RPS per pod)"; \
		echo ""; \
		kubectl get scaledobject $(RELEASE) --namespace $(NAMESPACE); \
		echo ""; \
		kubectl get hpa --namespace $(NAMESPACE); \
	elif kubectl get hpa $(RELEASE) --namespace $(NAMESPACE) >/dev/null 2>&1; then \
		echo "Autoscaler mode: CPU HPA (scales on CPU utilization)"; \
		echo ""; \
		kubectl get hpa $(RELEASE) --namespace $(NAMESPACE); \
	else \
		echo "Autoscaler mode: none (no ScaledObject or HPA found in namespace $(NAMESPACE))"; \
	fi

app-url:
	@minikube service $(RELEASE) --namespace $(NAMESPACE) --url

prometheus-url:
	@minikube service $(RELEASE)-prometheus --namespace $(NAMESPACE) --url

grafana-url:
	@minikube service $(RELEASE)-grafana --namespace $(NAMESPACE) --url

app-forward:
	kubectl port-forward --namespace $(NAMESPACE) svc/$(RELEASE) 3000:3000

prometheus-forward:
	kubectl port-forward --namespace $(NAMESPACE) svc/$(RELEASE)-prometheus 9090:9090

grafana-forward:
	kubectl port-forward --namespace $(NAMESPACE) svc/$(RELEASE)-grafana 3001:3000

wait-postgres:
	kubectl rollout status statefulset/$(RELEASE)-postgres --namespace $(NAMESPACE) --timeout=120s
	kubectl wait --for=condition=Ready pod/$(RELEASE)-postgres-0 --namespace $(NAMESPACE) --timeout=120s

seed-load-data:
	kubectl exec -n $(NAMESPACE) $(RELEASE)-postgres-0 -- psql -U iocheck -d iocheck -v ON_ERROR_STOP=1 -c "WITH generated AS (SELECT CASE WHEN n % 3 = 1 THEN 'ip' WHEN n % 3 = 2 THEN 'domain' ELSE 'sha256' END AS type, CASE WHEN n % 3 = 1 THEN format('10.66.%s.%s', (n / 256)::int, (n % 256)::int) WHEN n % 3 = 2 THEN format('seed-%s.bad-ioc.example', lpad(n::text, 4, '0')) ELSE lpad(to_hex(n), 64, '0') END AS value, 'load_seed'::text AS source, 50 + (n % 51)::int AS score FROM generate_series(1,$(LOAD_SEED_ROWS)) AS n) INSERT INTO iocs (type, value, source, score) SELECT type, value, source, score FROM generated ON CONFLICT (type, value) DO UPDATE SET source = EXCLUDED.source, score = EXCLUDED.score, added_at = NOW();"
	kubectl exec -n $(NAMESPACE) $(RELEASE)-postgres-0 -- psql -U iocheck -d iocheck -c "SELECT source, type, count(*) FROM iocs WHERE source = 'load_seed' GROUP BY source, type ORDER BY type;"

load-test-install:
	python3 -m pip install -r load-tests/requirements.txt

load-test: load-test-install
	IOCHECK_BASE_URL_OVERRIDE="$${IOCHECK_BASE_URL:-}"; \
	set -a; . $(LOAD_TEST_ENV); set +a; \
	if [ -n "$$IOCHECK_BASE_URL_OVERRIDE" ]; then export IOCHECK_BASE_URL="$$IOCHECK_BASE_URL_OVERRIDE"; fi; \
	locust --config $(LOAD_TEST_CONFIG)

# Snapshot everything needed to prove "CPU HPA never decided to scale" for the
# Challenge 1 writeup. Run this DURING a burst (give it ~$(EVIDENCE_SECONDS)s):
#   make autoscale-hpa
#   make load-test &     # in another shell
#   make capture-evidence
# Output lands in $(EVIDENCE_DIR)/<UTC timestamp>/ as plain text + JSON so the
# reviewer can diff timestamps between HPA decisions and SLO breaches.
capture-evidence:
	@set -e; \
	ts=$$(date -u +%Y%m%dT%H%M%SZ); \
	dir=$(EVIDENCE_DIR)/$$ts; \
	mkdir -p $$dir; \
	echo "Writing evidence to $$dir"; \
	kubectl get pods -n $(NAMESPACE) -o wide > $$dir/pods.txt 2>&1 || true; \
	kubectl get hpa,scaledobject -n $(NAMESPACE) -o wide > $$dir/autoscalers.txt 2>&1 || true; \
	kubectl describe hpa -n $(NAMESPACE) > $$dir/hpa-describe.txt 2>&1 || true; \
	kubectl describe scaledobject -n $(NAMESPACE) > $$dir/scaledobject-describe.txt 2>&1 || true; \
	kubectl get hpa -n $(NAMESPACE) -o yaml > $$dir/hpa.yaml 2>&1 || true; \
	kubectl get scaledobject -n $(NAMESPACE) -o yaml > $$dir/scaledobject.yaml 2>&1 || true; \
	kubectl top pods -n $(NAMESPACE) > $$dir/top-pods.txt 2>&1 || echo "metrics-server unavailable" > $$dir/top-pods.txt; \
	kubectl get events -n $(NAMESPACE) --sort-by=.lastTimestamp > $$dir/events.txt 2>&1 || true; \
	kubectl get events -n $(NAMESPACE) --field-selector reason=SuccessfulRescale --sort-by=.lastTimestamp > $$dir/rescale-events.txt 2>&1 || true; \
	echo "---" > $$dir/timeline.txt; \
	echo "captured_at_utc: $$ts" >> $$dir/timeline.txt; \
	echo "evidence_window_seconds: $(EVIDENCE_SECONDS)" >> $$dir/timeline.txt; \
	echo "namespace: $(NAMESPACE)" >> $$dir/timeline.txt; \
	echo "---" >> $$dir/timeline.txt; \
	end=$$(($$(date +%s) + $(EVIDENCE_SECONDS))); \
	while [ $$(date +%s) -lt $$end ]; do \
		now=$$(date -u +%H:%M:%SZ); \
		replicas=$$(kubectl get deploy $(RELEASE) -n $(NAMESPACE) -o jsonpath='{.status.readyReplicas}' 2>/dev/null); \
		hpa_state=$$(kubectl get hpa -n $(NAMESPACE) -o jsonpath='{range .items[*]}{.metadata.name}={.status.currentMetrics}{" desired="}{.status.desiredReplicas}{" last="}{.status.lastScaleTime}{"\n"}{end}' 2>/dev/null); \
		so_state=$$(kubectl get scaledobject -n $(NAMESPACE) -o jsonpath='{range .items[*]}{.metadata.name}=active:{.status.conditions[?(@.type=="Active")].status}{" ready:"}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null); \
		echo "$$now ready_replicas=$$replicas hpa=[$$hpa_state] scaledobject=[$$so_state]" >> $$dir/timeline.txt; \
		sleep 5; \
	done; \
	echo "Done. See $$dir/."
