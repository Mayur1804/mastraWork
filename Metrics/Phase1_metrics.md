# Phase 1 — Must ship (30+ metrics)

Implement these first to get strong visibility into correctness, cost, reliability, performance bottlenecks, and human escalation. Each metric below includes a short description and a one-line example you can show your manager.

## Core Business Metrics (Critical for Client Impression)

- Task Success Rate: Percentage of workflow runs that produce a business-acceptable compensation outcome.
	- Example: 170 successful outcomes out of 200 runs → Task Success Rate = 85%.

- Per-Run Cost: Total dollars charged for a single completed and accepted workflow (model calls + infra charges allocated to the run).
	- Example: a run used 1,500 tokens at $0.00002/token → Per-Run Cost ≈ $0.03 (plus infra).

- Total Model Spend: Aggregated spend on model provider calls over a reporting window (day/week/month).
	- Example: This week’s model spend across tenants = $2,400.

- Compensation Calculation Accuracy: Percentage of automation outputs that match domain validation rules or HR expected ranges.
	- Example: 90% of automated compensation calculations are within ±5% of expected HR values.

- Hallucination Rate: Percentage of outputs flagged by automated validators or humans as incorrect facts or invented details.
	- Example: 3 hallucinations found in 120 reviews → Hallucination Rate = 2.5%.

- Human Intervention Rate: Share of runs that require human review or correction before finalizing compensation.
	- Example: 20 escalations in 400 runs → Human Intervention Rate = 5%.

- Prompt Variant Performance: Compare success, latency, and cost for different `prompt_version` variants (A/B metrics).
	- Example: `prompt_v2` increased success from 82% → 90% and reduced tokens/cost by 10%.

## Performance & Latency Metrics (Workflow Time Analysis)

- Run Completion Latency (p50/p95/p99): End-to-end elapsed time from run start → final output (percentiles).
	- Example: p50=1.2s, p95=4.2s, p99=10.7s for end-to-end runs this week.

- Step-by-Step Latency Breakdown (p50/p95): Latency distribution per logical workflow step to find hotspots (e.g., retrieval, model call, post-process).
	- Example: `retrieve_profile` p50=120ms, `model_call` p95=3.8s — model call is the dominant cost.

- Time to First Token: Time from model request → arrival of the first response byte/token (user-perceived latency).
	- Example: Average Time to First Token = 250ms for streaming responses.

- External Dependency Latency (p95): Time spent waiting on external services (DBs, KBs, search, tool invocations) per run.
	- Example: KB retrieval p95 = 480ms; DB lookup p95 = 120ms.

- Plan Generation Time (p50/p95): Time to generate the initial plan/subplan that the agent will execute.
	- Example: Plan gen p50=600ms, p95=2.2s.

- Provider Latency (p95/p99): Round-trip time for each model provider call (useful to compare providers/endpoints).
	- Example: Provider A p95=1.2s vs Provider B p95=3.0s.

## Token & Cost Efficiency Metrics (Critical for AI Apps)

- Token Usage (total/input/output per run): Track tokens consumed per run broken into input vs output vs total.
	- Example: A run used input=1,200 tokens, output=400 tokens → total=1,600 tokens.

- Prompt Overhead Tokens: Tokens consumed by system prompts, repeated context, and scaffolding vs tokens used for actual task content.
	- Example: System prompt = 600 tokens (37.5% of 1,600 total tokens).

- Token Efficiency by Model: Compare cost-per-token and success-per-token across candidate models.
	- Example: Model A cost-per-successful-run = $0.05; Model B = $0.03.

- Context Window Utilization (%): Percent of the model’s available context window used by a typical run.
	- Example: Using a 32k context window, average run uses 8k tokens → 25% utilization.

- Model API Request Count: Number of model calls per run (and distribution across runs).
	- Example: Average calls per run = 3 (plan + refine + finalize).

### Best practices — Token & Cost Efficiency

- **Right-size models:** Prefer the smallest model that meets quality requirements; use cheaper models for drafts and escalate only when needed.
- **Trim and compress context:** Summarize long histories, remove irrelevant messages, and store distilled summaries for reuse to reduce input tokens.
- **Minimize prompt overhead:** Move stable instructions to concise system prompts or custom instructions; avoid repeating long scaffolding per call.
- **Control output length:** Use `max_tokens`, stop sequences, and explicit "be concise" instructions to limit generated tokens.
- **Cache and memoize:** Cache deterministic responses, embeddings, and frequently repeated prompts; reuse cached outputs instead of re-requesting the model.
- **Reuse embeddings:** Persist embedding vectors and only re-embed documents when content changes; retrieve top-k passages instead of sending full documents.
- **Batch and multiplex requests:** Combine multiple related queries into a single request when possible; batch embeddings and classification calls to lower per-call overhead.
- **Use model cascades:** Run inexpensive models for initial passes and escalate to larger models based on confidence or validation failures.
- **Prefer structured outputs:** Request JSON or use function-calling to produce compact, machine-parsable results instead of long free-text responses.
- **Avoid unnecessary retries:** Apply error classification and exponential backoff to prevent costly repeat calls for non-transient failures.
- **Offload deterministic logic:** Implement business rules, validations, and deterministic computations in application code rather than via LLM prompts.
- **Weigh fine-tuning vs prompt cost:** Consider fine-tuning or custom instructions to reduce prompt length, balancing upfront training cost with long-term token savings.
- **Monitor and alert:** Instrument per-run token counts, prompt overhead, and cost; set alerts and quotas to detect and cap cost spikes.

#### Implementation tips

- **Emit token metrics:** Record `tokens.input`, `tokens.output`, `tokens.total`, and `prompt_overhead_tokens` per `run_id`.
- **Track cost-per-success:** Measure `cost_per_successful_run` and `tokens_per_success` for A/B testing of prompts and models.
- **Use histograms:** Capture token counts and latencies as histograms to compute p50/p95/p99 and spot outliers.
- **Tag for analysis:** Include `prompt_version`, `model_name`, `model_provider`, and `billing_account` to enable fine-grained cost analysis.
- **Quick checklist:** Set per-tenant budgets, enable alerting on spend anomalies, and run periodic prompt audits to remove redundant tokens.

## Reliability & Failure Analysis Metrics

- Provider Error Rate: Percentage of model API calls returning 4xx/5xx or provider-side errors.
	- Example: 50 errors in 10,000 calls → Provider Error Rate = 0.5%.

- Step Failure Rate: Share of workflow steps that fail (by step type), before retrying.
	- Example: `calculate_bonus` failed 12 times out of 1,200 executions → 1% step failure rate.

- Retry Rate by Failure Type: Fraction of failures that trigger automated retries, broken down by error class (transient vs permanent).
	- Example: Transient network errors: 90% retried successfully; permanent validation failures not retried.

- Retries & Retry Rate (aggregate): Count and % of actions retried across runs (useful to spot instability and cost impact).
	- Example: Average retries per failed run = 1.4; overall retry rate = 3%.

- Model Fallback/Switch Events: Count of times the system switched from primary → fallback model due to errors/quality/cost.
	- Example: 5 fallbacks in 10,000 runs this month.

- API Endpoint Success Distribution: Success rate per provider endpoint (completions, chat, embeddings, etc.).
	- Example: Completions success 99.5%, embeddings success 98.2%.

- Throttling / Rate-Limit Events: Number and impact of provider rate-limits and exponential backoffs.
	- Example: 12 rate-limit events this week causing average 600ms retry backoff.

## Operational & Queue Metrics

- Workflow Runs (count): Completed runs per `workflow_id` and time window (throughput indicator).
	- Example: 1,200 completed runs/day across all tenants.

- Queue Length / Backlog: Number of pending runs/tasks waiting to start (gauge to detect overload).
	- Example: Peak backlog = 48 pending runs during the afternoon spike.

- Concurrency (active runs): Number of simultaneously active workflows/agents.
	- Example: Average concurrent runs = 12; peak = 80.

- Time to Human Response: Median and percentiles for time between escalation creation → human action.
	- Example: Median human response = 25 minutes; p95 = 6 hours.

## Validation & Intermediate Quality Metrics

- Intermediate Validation Pass Rate (per step): % of step outputs that pass automated validators before moving to next step.
	- Example: Salary-range validation passes 95% of the time at the review step.

- Cache/Memoization Hit Rate: Fraction of queries served from cache/memoized results vs fresh model calls.
	- Example: Cache hit rate = 30%, cutting model calls by ~30% for repeated queries.

## Monitoring & SLO Metrics

- Health Check / SLO Compliance: % of runs meeting declared SLOs (success AND latency AND cost thresholds); used for alerts and business KPIs.
	- Example: Target SLO = 99% success and p95 latency < 5s; current compliance = 97%.

---

## Implementation pointers

- Instrument events: `run.start`, `run.end`, `step.start`, `step.end`, `model.call.start`, `model.call.end`, `escalation.created`, `escalation.resolved`.
- Emit tags/dimensions: `agent_id`, `workflow_id`, `run_id`, `step_id`, `user_id`, `tenant_id`, `model_provider`, `model_name`, `model_version`, `env`, `region`, `prompt_version`, `outcome`, `failure_reason`, `billing_account`, `experiment_id`.
- Use histograms for latencies and token counts to derive p50/p95/p99.
- Correlate traces with `run_id` and `correlation_id` across logs, metrics, and traces.

