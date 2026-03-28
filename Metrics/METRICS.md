# Metrics

## Assumptions

- **Deployment model:** platform-hosted in cloud (you operate servers); clients do not run their own agents.
- **Multi-tenant storage:** logical separation in one shared DB (single database, `org_id` column for isolation).
- **Telemetry/observability:** Datadog is available and will be the primary SaaS for metrics, logs, and APM. Use OpenTelemetry as instrumentation standard.
- **Model provider:** OpenAI is used centrally (your platform provides the API key). Clients do not supply individual model keys. Token budget is allocated per organization.
- **Billing/quota:** tokens are tracked per-organization and enforced by the platform. Billing decisions will be driven by token consumption.
- **Privacy/compliance:** unknown — default to conservative handling (redact or hash PII, store raw prompts only when necessary and with retention rules).
- **DB choice:** recommend PostgreSQL (optionally with TimescaleDB extension) as the single-easy open-source DB for application data + time-series metrics; separate metrics cluster (ClickHouse/Prometheus/Timescale) can be suggested later for high scale.
- **Alerts/recipients:** initially, platform ops and product owners receive alerts; later enable client-admin alerts via dashboards.
- **SLOs & scale:** unknown; design metrics and alerting so SLOs can be set later (p50/p95/p99, error-rate targets).
- **Quality telemetry desired:** hallucination detection, user feedback capture, answer-quality signals, plus baseline telemetry (latency, errors, throughput, token usage).

## Planned deliverables (what you'll get below)

- Full metrics taxonomy (categories + specific metrics).
- For each metric: how to collect (instrumentation), storage recommendations, dashboard examples, alert rules.
- Token/quota design and enforcement pattern.
- DB schemas for core usage and quota tables.
- Datadog integration and recommended OpenTelemetry mapping.
- Practical best practices and implementation checklist.

---

## Metrics taxonomy and guidance

### 1) Core model & request metrics (per-request, per-org)

#### Request count (total, per-org, per-endpoint)
- **Collection:** increment on every incoming API/workflow call (middleware). Use Datadog counters / OTEL metrics.
- **Storage:** short-term in Datadog (metrics), long-term aggregated in Postgres daily summaries.
- **Dashboards/alerts:** trend lines, spike alerts (anomaly detection). Alert if sustained +200% above baseline.

#### Token usage — `tokens_requested`, `tokens_used`, `tokens_billed` (per request + per-org)
- **Collection:** parse model response metadata (OpenAI returns usage). Wrap model client to atomically record tokens per request.
- **Storage:** events in `usage_events` table (one row per request) + rollups (daily/org).
- **Dashboards/alerts:** per-org quota remaining; alert when remaining ≤ 10% or projected exhaustion within X days based on burn rate.

#### Model latency
- **Collection:** measure at client wrapper; emit histogram (p50/p95/p99). Instrument as OTEL histogram.
- **Dashboards/alerts:** p95 > SLA threshold -> alert; trending latency increase -> root-cause trace.

#### Model errors / failures / status codes
- **Collection:** capture HTTP status, provider error codes, and classify (rate-limit, auth, server).
- **Dashboards/alerts:** error-rate > X% or increases 3x baseline -> page ops.

#### Retry count per request
- **Collection:** request wrapper increments retry metric; correlate with latency & error spikes.
- **Use:** detect upstream provider instability or misconfigured timeouts.


### 2) Agent & workflow metrics (distributed traces + step-level timings)

#### Agent-to-agent handoff latency (per hop)
- **Collection:** instrument each agent invocation with OpenTelemetry span; include `org_id`, `workflow_id`, `step_name`.
- **Storage:** traces in Datadog APM (short-term) and trace sampling kept for deep debugging. For long-term, aggregate per-step durations into a `workflow_step_stats` table.
- **Dashboards/alerts:** slowest steps, bottleneck map; alert when a step’s p95 grows > X.

#### Workflow end-to-end latency (per workflow run)
- **Collection:** trace start/end; histogram. Track success vs failure.
- **Use:** SLA, user experience tracking.

#### Time spent waiting (queue/backpressure) between steps
- **Collection:** timestamps at enqueue/dequeue; measure queue length and average wait. Emit gauge for queue length.
- **Alerts:** queue length > threshold or wait-time > threshold -> autoscale or throttle.

#### Workflow failure count and failure reason distribution
- **Collection:** capture failure events with error classes, stack, and user-impact (partial vs full failure).
- **Alerts:** repeated failures in production -> escalate.


### 3) User/quality metrics

#### Feedback events (thumbs up/down, rating, free-form feedback) per response
- **Collection:** capture structured feedback tied to `request_id`, `user_id` (if available), and `org_id`. Store in `feedback_events`.
- **Use:** compute per-org/recent satisfaction rate, feed into retraining or prompt tuning.

#### Hallucination signals / factuality score (automated detectors)
- **Collection:** run automated checks (e.g., knowledge-check prompts, classifiers, or retrieval cross-check) and emit a hallucination score per response. Store in `hallucination_events`.
- **Dashboards:** % responses flagged as hallucinated; correlate with model version, prompt changes, or domain.

#### Human review rate
- **Collection:** flag events when human intervention requested or applied; track turnaround and resolution time.

#### Relevance / utility proxy
- **Metric:** rate of follow-up prompts within N minutes — use as indirect quality indicator.


### 4) Reliability & infra metrics

- **Service availability / health checks (per service instance):** heartbeat, uptime checks, container health. Emit to Datadog. Alerts for instance down or high restart rate.
- **CPU, memory, disk, network (per instance / per service):** host metrics via Datadog agent or cloud provider metrics.
- **DB metrics:** query latency (p95), connection count, deadlocks, replication lag (if used). Use DB exporter or Datadog integration.
- **Request queue length / backlog:** instrument queue system (Redis, SQS) for visible backlog.
- **Garbage / compaction / retention tasks durations.**


### 5) Security & audit metrics

- **Auth failures, permission denials per org/user:** log and metric for unauthorized attempts. Spike -> investigate potential attack.
- **Data-access audits:** write audit logs with minimal PII; store encrypted if needed.
- **Suspicious activity:** sudden token spike, unusual geo access -> immediate ops notification.


### 6) Cost & billing metrics

- **Cost per token / per-call estimate** (using provider price table) and actual token spend per org.
  - **Collection:** multiply `tokens_used` by provider cost, record per request. Maintain per-org daily cost.
  - **Dashboards/alerts:** Budget burn rate, projected spend exceed budget -> notify admin.
- **ROI or business KPIs (optional):** conversions, tasks completed, retained users (if instrumented).


### 7) UX / client-facing metrics

- **Org quota remaining (tokens left / percentage):** persistent `org_token_balance` updated atomically per request. Also expose read-only aggregated views for admin UI.
  - **Dashboards:** per-org panel with current balance, 7-day burn rate, projected exhaustion date. Alerts to org admins and platform ops.
- **Per-org usage breakdown (top users, top endpoints, peak times):** group-by queries and dashboards.
- **SLA adherence per org (if SLAs later defined):** % success/time windows.


---

## Suggested next steps / implementation checklist

- Implement OTEL instrumentation wrappers around the model client and workflow engine.
- Create `usage_events`, `feedback_events`, `hallucination_events`, and `workflow_step_stats` DB tables.
- Add daily rollup jobs to populate aggregated tables for dashboards.
- Configure Datadog dashboards and alerts (per-org panels, burn-rate alerts, latency SLOs).
- Implement quota enforcement with atomic decrements on `org_token_balance` and alerting for low-balance.
- Add PII handling policy (redaction/hashing) and retention rules for stored prompts.

