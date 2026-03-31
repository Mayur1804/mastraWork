(# Mastra Metrics — Phase 1

This document lists each Phase 1 metric, a short example, and a minimal Mastra-style instrumentation + aggregation code snippet that exports the metric as JSON. Use the shared helper `observability-utils.ts` (example below) to emit events from your agents/workflows and to aggregate metrics into JSON files.

Notes:
- Put the helper in `src/mastra/observability/observability-utils.ts` and import it from your agents/workflows.
- The repo already contains a Datadog forwarder example at `src/mastra/observability/datadog-llm.ts` which you can optionally use to send structured logs/metrics to Datadog.

---

## Shared helper (observability-utils.ts — example)

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

export type ObsEvent = {
	type: string;
	ts?: number;
	runId?: string;
	workflowId?: string;
	stepId?: string;
	model?: string;
	provider?: string;
	tokens?: { input?: number; output?: number; total?: number; promptOverhead?: number };
	durationMs?: number;
	timeToFirstTokenMs?: number;
	outcome?: string; // 'success'|'failure'|'needs_human'
	cost?: number;
	tags?: string[];
	metadata?: Record<string, unknown>;
};

const LOG_FILE = process.env.OBS_LOG_FILE ?? 'logs/observability.jsonl';
const METRICS_DIR = process.env.METRICS_DIR ?? 'metrics';

export async function emitEvent(e: ObsEvent) {
	const line = JSON.stringify({ ts: Date.now(), ...e }) + '\n';
	await fs.mkdir(path.dirname(LOG_FILE), { recursive: true }).catch(() => {});
	await fs.appendFile(LOG_FILE, line);
}

export async function readEvents(): Promise<ObsEvent[]> {
	try {
		const raw = await fs.readFile(LOG_FILE, 'utf8');
		return raw.trim().split('\n').filter(Boolean).map(JSON.parse);
	} catch {
		return [];
	}
}

export function percentile(arr: number[], p: number) {
	if (!arr.length) return 0;
	const sorted = arr.slice().sort((a, b) => a - b);
	const idx = Math.floor((sorted.length - 1) * p);
	return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function computeRate(events: ObsEvent[], pred: (e: ObsEvent) => boolean, denom: (e: ObsEvent) => boolean) {
	const d = events.filter(denom).length;
	if (!d) return 0;
	const n = events.filter(pred).length;
	return (n / d) * 100;
}

export function sumField(events: ObsEvent[], filterFn: (e: ObsEvent) => boolean, sel: (e: ObsEvent) => number | undefined) {
	return events.filter(filterFn).reduce((s, e) => s + (sel(e) || 0), 0);
}

export function percentileFromEvents(events: ObsEvent[], filterFn: (e: ObsEvent) => boolean, sel: (e: ObsEvent) => number | undefined, p: number) {
	const arr = events.filter(filterFn).map(sel).filter((v) => v != null) as number[];
	return percentile(arr, p);
}

export async function writeMetricJson(filename: string, payload: unknown) {
	await fs.mkdir(METRICS_DIR, { recursive: true });
	await fs.writeFile(path.join(METRICS_DIR, filename), JSON.stringify(payload, null, 2));
}
```

---

Below each metric: (1) the Example from Phase1, (2) a minimal instrumentation snippet (where to call `emitEvent`), and (3) an aggregator snippet that reads events and writes a JSON metric file.

## Core Business Metrics

### Task Success Rate
- Example: 170 successful outcomes out of 200 runs → Task Success Rate = 85%.

Instrumentation (emit at run end):

```ts
// when a run completes
import { emitEvent } from '../observability/observability-utils';

emitEvent({
	type: 'run.end',
	runId,
	workflowId,
	outcome: isBusinessAcceptable ? 'success' : 'failure',
	durationMs: elapsedMs,
	tags: [`prompt_version:${promptVersion}`],
	cost: runCost,
});
```

Aggregation:

```ts
import { readEvents, computeRate, writeMetricJson } from '../observability/observability-utils';

async function aggregateTaskSuccessRate() {
	const events = await readEvents();
	const rate = computeRate(events, (e) => e.type === 'run.end' && e.outcome === 'success', (e) => e.type === 'run.end');
	await writeMetricJson('task_success_rate.json', { metric: 'task_success_rate', value: rate });
}
```

### Per-Run Cost
- Example: a run used 1,500 tokens at $0.00002/token → Per-Run Cost ≈ $0.03 (plus infra).

Instrumentation (include cost on `run.end`):

```ts
emitEvent({ type: 'run.end', runId, workflowId, cost: runCost, tags: [/* ... */] });
```

Aggregation (average per-run or per-accepted-run):

```ts
import { readEvents, sumField, writeMetricJson } from '../observability/observability-utils';

async function aggregatePerRunCost() {
	const events = await readEvents();
	const runs = events.filter((e) => e.type === 'run.end');
	const totalCost = sumField(events, (e) => e.type === 'run.end' && e.cost != null, (e) => e.cost);
	const avg = runs.length ? totalCost / runs.length : 0;
	await writeMetricJson('per_run_cost.json', { metric: 'per_run_cost_avg', value: avg });
}
```

### Total Model Spend
- Example: This week’s model spend across tenants = $2,400.

Instrumentation (include `cost` on `model.call.end` or `run.end`):

```ts
emitEvent({ type: 'model.call.end', runId, model, provider, cost: callCost, durationMs });
```

Aggregation (sum over window):

```ts
import { readEvents, sumField, writeMetricJson } from '../observability/observability-utils';

async function aggregateTotalModelSpend() {
	const events = await readEvents();
	const total = sumField(events, (e) => e.type === 'model.call.end' && e.cost != null, (e) => e.cost);
	await writeMetricJson('total_model_spend.json', { metric: 'total_model_spend', value: total });
}
```

### Compensation Calculation Accuracy
- Example: 90% of automated compensation calculations are within ±5% of expected.

Instrumentation (emit validation result on step end):

```ts
emitEvent({
	type: 'step.end',
	runId,
	stepId: 'calculate_compensation',
	outcome: validationPassed ? 'success' : 'failure',
	metadata: { validation: { passed: validationPassed, deltaPct } },
});
```

Aggregation (percent passing):

```ts
import { readEvents, computeRate, writeMetricJson } from '../observability/observability-utils';

async function aggregateCompensationAccuracy() {
	const events = await readEvents();
	const rate = computeRate(
		events,
		(e) => e.type === 'step.end' && e.stepId === 'calculate_compensation' && (e.metadata as any)?.validation?.passed === true,
		(e) => e.type === 'step.end' && e.stepId === 'calculate_compensation'
	);
	await writeMetricJson('compensation_accuracy.json', { metric: 'compensation_accuracy_pct', value: rate });
}
```

### Hallucination Rate
- Example: 3 hallucinations found in 120 reviews → Hallucination Rate = 2.5%.

Instrumentation (mark hallucinations during automated/human review):

```ts
emitEvent({ type: 'model.review', runId, model, metadata: { hallucination: true, reviewerId } });
```

Aggregation:

```ts
import { readEvents, computeRate, writeMetricJson } from '../observability/observability-utils';

async function aggregateHallucinationRate() {
	const events = await readEvents();
	const rate = computeRate(
		events,
		(e) => e.type === 'model.review' && (e.metadata as any)?.hallucination === true,
		(e) => e.type === 'model.review'
	);
	await writeMetricJson('hallucination_rate.json', { metric: 'hallucination_rate_pct', value: rate });
}
```

### Human Intervention Rate
- Example: 20 escalations in 400 runs → Human Intervention Rate = 5%.

Instrumentation (emit on escalation creation):

```ts
emitEvent({ type: 'escalation.created', runId, workflowId, metadata: { reason } });
```

Aggregation (fraction of runs with escalation):

```ts
import { readEvents, writeMetricJson } from '../observability/observability-utils';

async function aggregateHumanInterventionRate() {
	const events = await readEvents();
	const runs = new Set(events.filter((e) => e.type === 'run.end').map((e) => e.runId));
	const escalatedRuns = new Set(events.filter((e) => e.type === 'escalation.created').map((e) => e.runId));
	const rate = runs.size ? (escalatedRuns.size / runs.size) * 100 : 0;
	await writeMetricJson('human_intervention_rate.json', { metric: 'human_intervention_rate_pct', value: rate });
}
```

### Prompt Variant Performance
- Example: `prompt_v2` increased success from 82% → 90% and reduced tokens/cost by 10%.

Instrumentation: tag `prompt_version` on `run.end` events (use `tags` or `metadata.prompt_version`).

Aggregation (group by variant):

```ts
import { readEvents, writeMetricJson } from '../observability/observability-utils';

async function aggregatePromptVariantPerformance() {
	const events = await readEvents();
	const runs = events.filter((e) => e.type === 'run.end');
	const byVariant: Record<string, { runs: number; successes: number; totalTokens: number; totalCost: number }> = {};
	for (const r of runs) {
		const variant = (r.tags || []).find((t) => t.startsWith('prompt_version:'))?.split(':')[1] || ((r.metadata||{}) as any).prompt_version || 'unknown';
		byVariant[variant] ??= { runs: 0, successes: 0, totalTokens: 0, totalCost: 0 };
		byVariant[variant].runs += 1;
		if (r.outcome === 'success') byVariant[variant].successes += 1;
		byVariant[variant].totalTokens += (r.tokens?.total || 0);
		byVariant[variant].totalCost += (r.cost || 0);
	}
	await writeMetricJson('prompt_variant_performance.json', { metric: 'prompt_variant_performance', byVariant });
}
```

## Performance & Latency Metrics

### Run Completion Latency (p50/p95/p99)
- Example: p50=1.2s, p95=4.2s, p99=10.7s.

Instrumentation: include `durationMs` on `run.end`.

Aggregation:

```ts
import { readEvents, percentileFromEvents, writeMetricJson } from '../observability/observability-utils';

async function aggregateRunLatency() {
	const events = await readEvents();
	const p50 = percentileFromEvents(events, (e) => e.type === 'run.end', (e) => e.durationMs, 0.5);
	const p95 = percentileFromEvents(events, (e) => e.type === 'run.end', (e) => e.durationMs, 0.95);
	const p99 = percentileFromEvents(events, (e) => e.type === 'run.end', (e) => e.durationMs, 0.99);
	await writeMetricJson('run_latency.json', { metric: 'run_latency_ms', p50, p95, p99 });
}
```

### Step-by-Step Latency Breakdown (p50/p95)
- Example: `retrieve_profile` p50=120ms, `model_call` p95=3.8s.

Instrumentation: emit `step.start` and `step.end` with `stepId` and `durationMs`.

Aggregation: group by `stepId` and compute percentiles (same pattern as run latency but filtered by `stepId`).

### Time to First Token
- Example: Average Time to First Token = 250ms for streaming responses.

Instrumentation: on streaming model calls record `timeToFirstTokenMs` on `model.call.end`.

Aggregation:

```ts
import { readEvents, percentileFromEvents, writeMetricJson } from '../observability/observability-utils';

async function aggregateTimeToFirstToken() {
	const events = await readEvents();
	const p50 = percentileFromEvents(events, (e) => e.type === 'model.call.end' && e.timeToFirstTokenMs != null, (e) => e.timeToFirstTokenMs, 0.5);
	const p95 = percentileFromEvents(events, (e) => e.type === 'model.call.end' && e.timeToFirstTokenMs != null, (e) => e.timeToFirstTokenMs, 0.95);
	await writeMetricJson('time_to_first_token.json', { metric: 'time_to_first_token_ms', p50, p95 });
}
```

### External Dependency Latency (p95)
- Example: Knowledge Base retrieval p95 = 480ms.

Instrumentation: emit `external.call.end` with `durationMs` and `dependency` name.

Aggregation: filter `external.call.end` by dependency and compute percentiles.

### Plan Generation Time (p50/p95)
- Example: Plan gen p50=600ms, p95=2.2s.

Instrumentation: emit `plan.generated` or `model.call.end` with `metadata.phase='plan'` and `durationMs`.

Aggregation: use percentileFromEvents filtered by event type/metadata.

### Provider Latency (p95/p99)
- Example: Provider A p95=1.2s vs Provider B p95=3.0s.

Instrumentation: tag `provider` on `model.call.end` events.

Aggregation: group `model.call.end` by `provider` and compute percentiles.

## Token & Cost Efficiency Metrics

### Token Usage (total/input/output per run)
- Example: input=1,200 tokens, output=400 tokens → total=1,600 tokens.

Instrumentation: include `tokens` structure on `model.call.end` and/or `run.end`.

Aggregation: sum tokens per run and export totals or histograms.

```ts
import { readEvents, writeMetricJson } from '../observability/observability-utils';

async function aggregateTokenUsage() {
	const events = await readEvents();
	const runs = events.filter((e) => e.type === 'run.end');
	const totals = runs.map((r) => ({ runId: r.runId, input: r.tokens?.input || 0, output: r.tokens?.output || 0, total: r.tokens?.total || 0 }));
	await writeMetricJson('token_usage_per_run.json', { metric: 'token_usage_per_run', totals });
}
```

### Prompt Overhead Tokens
- Example: System prompt = 600 tokens (37.5% of 1,600 total tokens).

Instrumentation: record `tokens.promptOverhead` on `run.end`.

Aggregation: compute `promptOverhead / total` per run or averaged.

### Token Efficiency by Model
- Example: Model A cost-per-successful-run = $0.05; Model B = $0.03.

Instrumentation: tag `model` on `run.end`/`model.call.end` and include `cost` + `outcome`.

Aggregation: group by model and compute cost-per-success and tokens-per-success.

### Context Window Utilization (%)
- Example: Using a 32k context window, average run uses 8k tokens → 25% utilization.

Instrumentation: include `model_context_window` and `tokens.total` on `run.end`.

Aggregation: compute percentage = tokens.total / model_context_window * 100.

### Model API Request Count
- Example: Average calls per run = 3 (plan + refine + finalize).

Instrumentation: emit `model.call.start`/`model.call.end` and count per `runId`.

Aggregation: count events grouped by `runId` and compute distribution.

## Reliability & Failure Analysis Metrics

### Provider Error Rate
- Example: 50 errors in 10,000 calls → Provider Error Rate = 0.5%.

Instrumentation: include `error` and `statusCode` on `model.call.end`.

Aggregation: compute errors / total model calls.

### Step Failure Rate
- Example: `calculate_bonus` failed 12 times out of 1,200 executions → 1% step failure rate.

Instrumentation: `step.end` with `outcome` and optional `failureReason`.

Aggregation: failure count / total step runs.

### Retry Rate by Failure Type
- Example: Transient network errors: 90% retried successfully.

Instrumentation: emit `retry` events with `failureType` and `success` flag.

Aggregation: group `retry` events by `failureType` and compute success ratio.

### Retries & Retry Rate (aggregate)
- Count and % of actions retried across runs.

Instrumentation: as above; aggregator counts retries per run and overall percent.

### Model Fallback/Switch Events
- Example: 5 fallbacks in 10,000 runs this month.

Instrumentation: emit `model.fallback` events with `fromModel` and `toModel`.

Aggregation: count fallback events and group by model pairs.

### API Endpoint Success Distribution
- Example: Completions success 99.5%, embeddings success 98.2%.

Instrumentation: tag `endpoint` on `model.call` events (e.g., `completions`, `chat`, `embeddings`). Include success/failure.

Aggregation: compute success% by endpoint type.

### Throttling / Rate-Limit Events
- Example: 12 rate-limit events this week causing average 600ms retry backoff.

Instrumentation: emit `provider.rate_limit` events with `backoffMs` and `provider`.

Aggregation: aggregate counts and average `backoffMs` by provider.

## Operational & Queue Metrics

### Workflow Runs (count)
- Example: 1,200 completed runs/day across all tenants.

Instrumentation: count `run.end` events.

Aggregation: simple count grouped by `workflowId` and time window.

### Queue Length / Backlog
- Example: Peak backlog = 48 pending runs.

Instrumentation: periodically emit `queue.length` gauge events with the current backlog.

Aggregation: read gauges and report max/avg over window.

### Concurrency (active runs)
- Example: Average concurrent runs = 12; peak = 80.

Instrumentation: increment/decrement an in-memory gauge on `run.start`/`run.end` or record `run.active` snapshots.

Aggregation: compute average/peak from snapshots or replay start/end events.

### Time to Human Response
- Example: Median human response = 25 minutes; p95 = 6 hours.

Instrumentation: `escalation.created` and `escalation.resolved` with timestamps.

Aggregation: compute deltas and percentiles.

## Validation & Intermediate Quality Metrics

### Intermediate Validation Pass Rate (per step)
- Example: Salary-range validation passes 95% of the time at the review step.

Instrumentation: `step.end` with `validation.pass` boolean in metadata.

Aggregation: compute pass% by `stepId`.

### Cache/Memoization Hit Rate
- Example: Cache hit rate = 30%.

Instrumentation: emit `cache.hit` and `cache.miss` events with `key` and `runId`.

Aggregation: hits / (hits + misses) * 100.

## Monitoring & SLO Metrics

### Health Check / SLO Compliance
- Example: Target SLO = 99% success and p95 latency < 5s; current compliance = 97%.

Instrumentation: depends on the SLO rules — combine `run.end` outcome, latency, and cost fields into a SLO evaluation.

Aggregation (simple example):

```ts
import { readEvents, percentileFromEvents, computeRate, writeMetricJson } from '../observability/observability-utils';

async function aggregateSLOCompliance() {
	const events = await readEvents();
	const successRate = computeRate(events, (e) => e.type === 'run.end' && e.outcome === 'success', (e) => e.type === 'run.end');
	const p95 = percentileFromEvents(events, (e) => e.type === 'run.end', (e) => e.durationMs, 0.95);
	const compliant = successRate >= 99 && p95 <= 5000; // example thresholds
	await writeMetricJson('slo_compliance.json', { metric: 'slo_compliance', successRate, p95, compliant });
}
```

---

Usage & notes:
- Instrument your agents/workflows at the points indicated above using `emitEvent(...)`.
- Run aggregators periodically (cron, CI job, or ad-hoc) to produce JSON files under `metrics/`.
- Optional: forward each emitted event to Datadog using `recordLLMInteraction` in `src/mastra/observability/datadog-llm.ts` for live dashboards.

If you want, I can add the `observability-utils.ts` file and a single aggregator script `scripts/aggregate-phase1.ts` to the repo and wire a couple of example emit calls into `src/mastra/agents/` to demonstrate end-to-end. Want me to create those files now?
)
