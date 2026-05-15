{{- define "iocheck.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "iocheck.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "iocheck.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "iocheck.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "iocheck.selectorLabels" -}}
app.kubernetes.io/name: {{ include "iocheck.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: app
{{- end -}}

{{- define "iocheck.postgresName" -}}
{{- printf "%s-postgres" (include "iocheck.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "iocheck.redisName" -}}
{{- printf "%s-redis" (include "iocheck.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "iocheck.prometheusName" -}}
{{- printf "%s-prometheus" (include "iocheck.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "iocheck.grafanaName" -}}
{{- printf "%s-grafana" (include "iocheck.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
