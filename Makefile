RELEASE ?= iocheck
NAMESPACE ?= iocheck
CHART ?= helm/iocheck
IMAGE ?= iocheck
TAG ?= latest
POSTGRES_INIT_SQL ?= database/migrations/001_create_iocs.sql

.PHONY: minikube-start image helm-install helm-upgrade helm-uninstall status app-url prometheus-url

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
	kubectl get pods,svc,pvc,pdb --namespace $(NAMESPACE)

app-url:
	@minikube service $(RELEASE) --namespace $(NAMESPACE) --url

prometheus-url:
	@minikube service $(RELEASE)-prometheus --namespace $(NAMESPACE) --url
