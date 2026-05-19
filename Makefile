RELEASE ?= iocheck
NAMESPACE ?= iocheck
KEDA_NAMESPACE ?= keda
CHART ?= helm/iocheck
IMAGE ?= iocheck
TAG ?= latest
POSTGRES_INIT_SQL ?= database/migrations/001_create_iocs.sql
LOAD_TEST_ENV ?= load-tests/config/basic.env
LOAD_TEST_CONFIG ?= load-tests/config/local.conf

.PHONY: minikube-start image keda-install metrics-server-enable helm-install helm-upgrade helm-uninstall autoscale-hpa autoscale-keda autoscaler-status status app-url prometheus-url grafana-url app-forward prometheus-forward grafana-forward load-test-install load-test

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

helm-install: keda-install image
	helm upgrade --install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set image.repository=$(IMAGE) \
		--set image.tag=$(TAG) \
		--set-file postgres.initSql=$(POSTGRES_INIT_SQL)

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
		--set autoscaling.maxReplicas=6 \
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

load-test-install:
	python3 -m pip install -r load-tests/requirements.txt

load-test:
	set -a; . $(LOAD_TEST_ENV); set +a; locust --config $(LOAD_TEST_CONFIG)
