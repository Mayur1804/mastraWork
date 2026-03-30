Metrics Roadmap

Purpose
- Consolidate the metrics guidance from `METRICS.md` and `Phase1_metrics.md` into a single, actionable roadmap.
- Provide a prioritized list of requirements that must be implemented immediately to deliver baseline observability, cost control, and quality telemetry for the platform.

Scope
- Sources: Metrics/METRICS.md and Metrics/Phase1_metrics.md.
- Audience: engineering (platform & infra), product, and ops.
- Outcome: One prioritized set of implementation tasks, each with a short rationale and minimal acceptance criteria.

Immediate priorities (must ship first)
1. Instrumentation wrappers for model calls and workflows (Priority: P0)
   - Rationale: All core metrics (tokens, latency, errors) depend on reliable instrumentation.
   - Requirements:
     - Add middleware/wrappers that emit events: `run.start`, `run.end`, `step.start`, `step.end`, `model.call.start`, `model.call.end`, `model.call.error`.
     - Emit token usage per model call: `tokens.input`, `tokens.output`, `tokens.total` (parse provider response usage).
     - Record provider status codes and classify errors (rate-limit, auth, server).
     - Acceptance: Representative dashboard showing request count, token usage, and provider error rate for the last 24h.

2. Token usage and quota enforcement (Priority: P0)
   - Rationale: Prevent runaway costs and enable per-org billing/quota alerts.
   - Requirements:
     - Implement `usage_events` (one row per request) capturing `org_id`, `run_id`, `model`, `tokens_total`, `tokens_input`, `tokens_output`, `cost_estimate`.
     - Add `org_token_balance` (atomic decrement on accepted requests) and low-balance alerts (<=10% remaining).
     - Alerting: notify ops + tenant admin when projected exhaustion within 72 hours.
     - Acceptance: Demo of a successful atomic token decrement and an alert triggered by low balance.

3. Datadog + OpenTelemetry mapping and baseline dashboards (Priority: P0)
   - Rationale: Centralized metrics, traces, and logs for debugging and SLOs.
   - Requirements:
     - Map emitted events to OTEL metrics and spans (histograms for latencies, counters for counts).
     - Create baseline dashboards: per-org overview, model latency (p50/p95/p99), token burn rate, provider error rate, and top 10 tenants by spend.
     - Create alert rules: provider error-rate spike, sustained latency regression, token budget low.
     - Acceptance: Dashboards accessible in Datadog with working alert that fires on a simulated condition.

4. DB schemas and daily rollups (Priority: P0)
   - Rationale: Store detailed usage for billing and long-term analysis.
   - Requirements:
     - Create core tables: `usage_events`, `workflow_step_stats`, `feedback_events`, `hallucination_events`.
     - Implement nightly rollup job to populate daily aggregates (tokens_per_org_day, model_latency_rollups).
     - Acceptance: Rollup job runs and generates daily aggregates for the previous day.

5. Hallucination detection and human feedback capture (Priority: P0)
   - Rationale: Track output quality and enable retraining/prompt tuning decisions.
   - Requirements:
     - Capture structured feedback events with `request_id`, `user_id`, `org_id`, `rating`, `free_text`.
     - Integrate an automated factuality check (classifier or retrieval-check) and store `hallucination_score` per response.
     - Acceptance: Observable metric for hallucination_rate and a sample of feedback events stored.

6. Tracing and step-level timings (Priority: P1)
   - Rationale: Diagnose slow steps and optimize workflows.
   - Requirements:
     - Instrument OpenTelemetry spans for agents and workflow steps (`agent_id`, `workflow_id`, `step_name`).
     - Emit per-step histograms and store aggregated `workflow_step_stats` for p50/p95 analysis.
     - Acceptance: Trace links from dashboard to a sampled trace showing step durations.

7. Quick-win dashboards and alerts (Priority: P1)
   - Rationale: Early visibility for key stakeholders while broader coverage is rolled out.
   - Requirements:
     - Create per-org “health tile” with: quota remaining, 7-day burn rate, p95 latency, and success-rate.
     - Add nightly email/Slack summary for top spenders and anomalies.
     - Acceptance: Stakeholder receives the nightly summary and dashboard exists.

Operational & reliability items (implement soon)
- Retry & fallback telemetry: record retry counts, fallback triggers, and associated cost impact.
- Queue/backlog metrics: queue length, average wait time, and backpressure alerts.
- Provider-specific metrics: per-provider latency and error distribution for model selection decisions.
- Infra metrics: CPU/memory/threadpool usage for services that host agents; integrate host metrics into Datadog.

Security, privacy, and retention
- PII handling: redact or hash PII before storing prompts. Store raw prompts only with explicit retention policy and access controls.
- Audit & access logs: capture auth failures, permission denials, and suspicious token usage spikes.
- Retention: store detailed request logs for N days (configurable), keep rollups for longer (e.g., 1 year).

Short-term implementation checklist (concrete tasks to execute now)
- [ ] Implement model client wrapper that records tokens + latency + status codes (owner: Platform eng).
- [ ] Emit OTEL spans for runs and steps (owner: Platform eng).
- [ ] Create `usage_events` and `org_token_balance` tables and migration (owner: Data infra).
- [ ] Wire events into Datadog (metrics + traces) and build the baseline dashboards (owner: Observability).
- [ ] Implement atomic quota decrement and low-balance alerting (owner: Platform eng).
- [ ] Create nightly rollup job for daily aggregates (owner: Data infra).
- [ ] Add feedback capture endpoint and `feedback_events` table (owner: Product & Platform eng).
- [ ] Add an automated hallucination check pipeline and `hallucination_events` (owner: ML/Research).
- [ ] Document PII handling and retention policy and get legal sign-off (owner: Security/Legal).

Acceptance criteria (how we'll know it's done)
- Telemetry is emitted for every model call and workflow run, and is visible in Datadog dashboards.
- Per-org token balances update atomically per request and low-balance alerts trigger correctly.
- Nightly rollups produce daily aggregates used by dashboards and billing.
- Feedback and hallucination events are captured and can be queried per org and per run.
- Baseline dashboards and at least three alerts (error-rate spike, low-balance, latency regression) are active.

Next steps & timeline suggestion
- Week 0 (days 0–3): Implement model wrapper + immediate OTEL metrics; create `usage_events` schema.
- Week 1: Quota enforcement, atomic balance updates, low-balance alerts; baseline Datadog dashboards.
- Week 2: Nightly rollups, feedback capture, basic hallucination detector integration.
- Week 3: Add advanced dashboards, SLO definitions (p95 latency, success-rate), and trace sampling adjustments.

Notes & references
- Consolidated from `METRICS.md` and `Phase1_metrics.md`.
- Follow OTEL for spans/metrics and Datadog for dashboards and alerts.
- Use provider usage responses to derive token counts (atomic write path for billing accuracy).

If you want, I can now:
- Convert the short-term checklist into tracked tickets (Jira/GitHub Issues).
- Create a minimal DB migration SQL and schema docs (no code until you confirm).
- Draft the Datadog dashboard JSON templates to import.

---
