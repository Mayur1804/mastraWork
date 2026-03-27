# Metrics Rollout Roadmap — Agentic Compensation App

This document lists the prioritized metrics for your enterprise-grade agentic compensation HR application, organized into three implementation phases (Phase 1 = ship first; Phase 2 = next; Phase 3 = long-term).

## Notes
- Use the recommended tags/dimensions for each metric: `agent_id`, `workflow_id`, `run_id`, `step_id`, `user_id`, `tenant_id`, `model_provider`, `model_name`, `model_version`, `env`, `region`, `prompt_version`, `outcome`, `failure_reason`, `billing_account`, `experiment_id`.
- Prefer counters, gauges, and histograms (percentiles) depending on metric type.

---

## Phase 1 — Must ship (30+ metrics)
Implement these first to get strong visibility into correctness, cost, reliability, performance bottlenecks, and human escalation.

### Core Business Metrics (Critical for Client Impression)
- **Task Success Rate**: % of workflow runs producing business-acceptable compensation outcomes. [PRIMARY KPI]
- **Per-Run Cost**: Dollars spent per completed, accepted workflow. [FINANCIAL IMPACT]
- **Total Model Spend**: Aggregated provider spend (daily/weekly/monthly). [BUDGET TRACKING]
- **Compensation Calculation Accuracy**: % of calculated compensations within expected range/formula validation (domain-specific). [BUSINESS VALIDATION]
- **Hallucination Rate**: % outputs flagged by validators or human review as hallucinations. [RELIABILITY]
- **Human Intervention Rate**: % runs escalated to humans for review/correction. [QUALITY GATE]
- **Prompt Variant Performance**: Success/latency/cost per `prompt_version` (A/B testing). [OPTIMIZATION CAPABILITY]

### Performance & Latency Metrics (Workflow Time Analysis)
- **Run Completion Latency (p50/p95/p99)**: End-to-end run time from start → final output. [USER EXPERIENCE]
- **Step-by-Step Latency Breakdown (p50/p95)**: Granular latency per workflow step type to identify bottlenecks.
- **Time to First Token**: Perceived latency from request → first model response chunk (user-centric metric).
- **External Dependency Latency (p95)**: Time spent on DB queries, knowledge base retrievals, tool invocations per run.
- **Plan Generation Time (p50/p95)**: Time to produce initial plan/subplan from start.
- **Provider Latency (p95/p99)**: Model provider round-trip latency per API call.

### Token & Cost Efficiency Metrics (Critical for AI Apps)
- **Token Usage (total/input/output per run)**: Tokens consumed per run, aggregated by model and step. [COST DRIVER]
- **Prompt Overhead Tokens**: Cumulative tokens from system prompt + context setup vs. actual task content tokens.
- **Token Efficiency by Model**: Cost-per-token ratio comparison across provider models (which model gives best ROI).
- **Context Window Utilization (%)**: % of available model context used per run (efficiency indicator).
- **Model API Request Count**: Count of model calls (per run/agent/step/period).

### Reliability & Failure Analysis Metrics
- **Provider Error Rate**: % provider API errors (4xx/5xx) for model calls per endpoint.
- **Step Failure Rate**: % failing steps by step type across runs.
- **Retry Rate by Failure Type**: Distinguish transient failures (retriable) vs. permanent failures (non-retriable).
- **Retries & Retry Rate (aggregate)**: Count/% of retried actions and cumulative retries per run.
- **Model Fallback/Switch Events**: Count of times primary model fails → fallback model invoked.
- **API Endpoint Success Distribution**: Success rate per provider endpoint to identify weak points.
- **Throttling / Rate-Limit Events**: Count of provider rate-limits and backoffs.

### Operational & Queue Metrics
- **Workflow Runs (count)**: Completed runs per `workflow_id` / time window. [THROUGHPUT]
- **Queue Length / Backlog**: Pending runs/tasks waiting to start (gauge).
- **Concurrency (active runs)**: Simultaneous active workflows/agents running.
- **Time to Human Response**: Median/percentile from escalation → human action.

### Validation & Intermediate Quality Metrics
- **Intermediate Validation Pass Rate (per step)**: % of outputs passing each step's validator/check before proceeding.
- **Cache/Memoization Hit Rate**: % of compensation queries answered from cache vs. fresh model calls.

### Monitoring & SLO Metrics
- **Health Check / SLO Compliance**: % runs meeting defined SLOs (success + latency + cost thresholds).

---

## Phase 2 — High priority next
Expand observability into step-level performance, grounding, and provider behavior.

- Per-Step Latency (p50/p95/p99): Latency distribution per workflow step.
- Step Success Rate (by step type): Per-step success percentages and trends.
- Decision Branching Count: Number of branches/paths taken per run.
- Provider Availability / Uptime: Provider endpoint availability.
- Token Cost Efficiency: Cost per token / cost per useful token output.
- Model Response Size: Output size distribution (tokens/bytes).
- Prompt Truncation Events: Count of context truncations and dropped context.
- Tool Invocation Count & Success: External tool calls (DBs, KBs) and success rates.
- Cache Hit / Miss Rate: For retrievals used in grounding.
- Grounding Latency: Time to fetch external evidence / retrieval latency.
- Trace Coverage & Correlation ID Coverage: % traces correlated across services.
- Logs Ingested (volume/size): Logging volume and rate.

---

## Phase 3 — Long-term / nice-to-have
Governance, deep reliability signals, developer and experimentation metrics.

- Hallucination Root-Cause Metrics: hallucinations by prompt_version, model, source data.
- Verification Pass Rate: % outputs passing automated fact-checkers.
- Citation Coverage: % answers containing expected citations/evidence.
- DLP / PII Exposure Events: Detected PII in outputs and redaction events.
- Compliance / Retention Violations: Counts of retention-policy breaches.
- MTTR / MTBF / Failover Events / Circuit Breaker Activations: incident & resilience metrics.
- Experimentation Metrics: experiment buckets, metric deltas by variant.
- Developer Metrics: deploy frequency, failure-after-deploy rate, hotfix/rollback count.
- APM Sampling & Trace Latency Breakdown: deeper APM insights.
- Audit Log Coverage & Consent Status Coverage: governance telemetry.

---

## Implementation Guidance
- Start instrumenting Phase 1 with structured events: `run.start`, `run.end`, `step.start`, `step.end`, `model.call.start`, `model.call.end`, `escalation.created`, `escalation.resolved`.
- Emit tags/dimensions consistently to enable slicing (tenant, workflow, agent, model_version, prompt_version).
- Use histograms for latencies and token counts so you can derive p50/p95/p99.
- Correlate traces with `run_id` and `correlation_id` across logs, metrics, and traces.
- For Datadog: push custom metrics like `comp.run.success`, `comp.run.latency`, `comp.model.tokens`, `comp.hallucination.rate` and create SLO monitors for `comp.run.success` and `comp.run.latency.p95`.

## Next steps
1. Instrument Phase 1 events and metrics with consistent tags.
2. Create Datadog dashboards and SLOs for top business signals (Task Success Rate, Run Latency p95, Total Model Spend).
3. Iterate: add Phase 2 after 2–4 sprints of Phase 1 telemetry running in production.
