import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type MetricRecord = {
  type?: 'workflow';
  runId: string;
  workflowId: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  duration?: string;
  status?: string;
  input?: any;
  output?: any;
  error?: any;
  steps?: any;
};

type AgentMetricRecord = {
  type: 'agent';
  agentId: string;
  runId: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  duration?: string;
  input?: any;
  output?: any;
  error?: any;
  usage?: any;
};


function findRepoRoot(): string {
  // Walk up from this module's location, skipping .mastra build dirs
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const isBuildDir = /[/\\]\.mastra([/\\]|$)/.test(dir);
    if (!isBuildDir) {
      try {
        if (fsSync.existsSync(path.join(dir, 'package.json'))) return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: walk up from process.cwd()
  dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      if (fsSync.existsSync(path.join(dir, 'package.json'))) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const baseDir = process.env.WORKFLOW_METRICS_DIR
  ? path.resolve(process.env.WORKFLOW_METRICS_DIR)
  : path.join(findRepoRoot(), 'workflowMetrics', 'runs');

if (process.env.DEBUG_WORKFLOW_METRICS) {
  // eslint-disable-next-line no-console
  console.log('[WorkflowMetrics] baseDir resolved to', baseDir);
}

async function ensureDir() {
  await fs.mkdir(baseDir, { recursive: true });
}

function serializeError(err: any) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  try {
    return JSON.parse(JSON.stringify(err));
  } catch (e) {
    return String(err);
  }
}

function formatDuration(ms?: number) {
  if (ms === undefined || ms === null) return undefined;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(3)}s`;
}

export async function recordStart(runId: string, workflowId: string, input?: any) {
  await ensureDir();
  const filePath = path.join(baseDir, `${runId}.json`);
  const rec: MetricRecord = { runId, workflowId, startTime: new Date().toISOString(), input };
  await fs.writeFile(filePath, JSON.stringify(rec, null, 2), 'utf8');
}

export async function recordEnd(runId: string, data: { output?: any; status?: string; error?: any; steps?: any } = {}) {
  await ensureDir();
  const filePath = path.join(baseDir, `${runId}.json`);
  let rec: MetricRecord = { runId, workflowId: 'unknown' };

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    rec = JSON.parse(raw) as MetricRecord;
  } catch (e) {
    // File may not exist; we'll continue with minimal record
  }

  const endTime = new Date().toISOString();
  const durationMs = rec.startTime ? new Date(endTime).getTime() - new Date(rec.startTime).getTime() : undefined;

  rec.endTime = endTime;
  rec.durationMs = durationMs;
  rec.duration = formatDuration(durationMs);
  if (data.status) rec.status = data.status;
  if (data.output !== undefined) rec.output = data.output;
  if (data.error !== undefined) rec.error = serializeError(data.error);
  if (data.steps !== undefined) rec.steps = data.steps;

  await fs.writeFile(filePath, JSON.stringify(rec, null, 2), 'utf8');
}

export async function exportAllMetrics(): Promise<MetricRecord[]> {
  await ensureDir();
  const files = await fs.readdir(baseDir);
  const results: MetricRecord[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(baseDir, f), 'utf8');
    results.push(JSON.parse(raw));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Agent metrics
// ---------------------------------------------------------------------------

/**
 * Record the start of an agent invocation.
 * agentId  – the agent's id string (e.g. 'weather-agent')
 * runId    – a unique id for this invocation; use the workflow step's runId
 *            (suffixed if needed) or crypto.randomUUID() for direct runs.
 */
export async function recordAgentStart(agentId: string, runId: string, input?: any) {
  await ensureDir();
  const filePath = path.join(baseDir, `agent-${agentId}-${runId}.json`);
  const rec: AgentMetricRecord = {
    type: 'agent',
    agentId,
    runId,
    startTime: new Date().toISOString(),
    input,
  };
  await fs.writeFile(filePath, JSON.stringify(rec, null, 2), 'utf8');
}

/**
 * Record the end of an agent invocation.  Reads the start record written by
 * recordAgentStart (if present) so it can compute durationMs.
 */
export async function recordAgentEnd(
  agentId: string,
  runId: string,
  data: { output?: any; error?: any; usage?: any } = {},
) {
  await ensureDir();
  const filePath = path.join(baseDir, `agent-${agentId}-${runId}.json`);
  let rec: AgentMetricRecord = { type: 'agent', agentId, runId };

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    rec = JSON.parse(raw) as AgentMetricRecord;
  } catch {
    // Start record may be missing for direct agent runs; continue
  }

  const endTime = new Date().toISOString();
  const durationMs = rec.startTime
    ? new Date(endTime).getTime() - new Date(rec.startTime).getTime()
    : undefined;

  rec.endTime = endTime;
  rec.durationMs = durationMs;
  rec.duration = formatDuration(durationMs);
  if (data.output !== undefined) rec.output = data.output;
  if (data.error !== undefined) rec.error = serializeError(data.error);
  if (data.usage !== undefined) rec.usage = data.usage;

  await fs.writeFile(filePath, JSON.stringify(rec, null, 2), 'utf8');
}
