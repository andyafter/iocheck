RELEASE ?= iocheck
NAMESPACE ?= iocheck
CHART ?= helm/iocheck
IMAGE ?= iocheck
TAG ?= latest
POSTGRES_INIT_SQL ?= database/migrations/001_create_iocs.sql
LOAD_TEST_ENV ?= load-tests/config/basic.env
LOAD_TEST_CONFIG ?= load-tests/config/local.conf

.PHONY: minikube-start image helm-install helm-upgrade helm-uninstall status app-url prometheus-url grafana-url app-forward prometheus-forward grafana-forward load-test-install load-test

minikube-start:
	minikube start

image:
	minikube image build -t $(IMAGE):$(TAG) .

helm-install: image
	helm upgrade --install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set image.repository=$(IMAGE) \
		--set image.tag=$(TAG) \
		--set-file postgres.initSql=$(POSTGRES_INIT_SQL)

helm-upgrade: helm-install

helm-uninstall:
	helm uninstall $(RELEASE) --namespace $(NAMESPACE)

status:
	kubectl get pods,svc,pvc,pdb,hpa --namespace $(NAMESPACE)

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
