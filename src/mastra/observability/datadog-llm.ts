import * as os from 'node:os';

type DatadogConfig = {
  apiKey?: string;
  applicationKey?: string; // needed to create dashboards via the API
  site?: string; // e.g. datadoghq.com or datadoghq.eu
  serviceName?: string;
  env?: string;
  logsUrl?: string;
  metricsUrl?: string;
};

let config: DatadogConfig = {};

export function initDatadogObservability(opts: DatadogConfig) {
  config = { ...config, ...opts };

  if (!config.apiKey) {
    console.warn('[Datadog] DD_API_KEY is not set — Datadog logs/metrics will be disabled.');
    return;
  }

  const site = config.site || 'datadoghq.com';
  console.info(`[Datadog] Initialized — service="${config.serviceName || 'mastra'}" site="${site}" env="${config.env ?? 'development'}"`);

  // Send a startup heartbeat so you can verify connectivity in the Datadog Log Explorer immediately
  sendLog({
    message: 'mastra service started',
    status: 'info',
    attributes: { event: 'startup', hostname: os.hostname() },
  }).then(async (ok) => {
    if (ok) {
      console.info('[Datadog] ✓ Startup log delivered successfully — check Log Explorer in Datadog.');
    } else {
      console.error('[Datadog] ✗ Startup log delivery FAILED. Check DD_API_KEY and DD_SITE values.');
    }

    // send a startup metric (best-effort)
    sendMetric('mastra.startup', 1, [`service:${config.serviceName || 'mastra'}`]).catch(() => {});

    // create a minimal dashboard if we have an application key
    if (config.applicationKey) {
      const created = await createMinimalDashboard();
      if (created) console.info('[Datadog] ✓ Minimal dashboard created — open Datadog dashboards to view it.');
      else console.warn('[Datadog] ⚠ Minimal dashboard creation failed or already exists.');
    } else {
      console.info('[Datadog] DD_APPLICATION_KEY not set — skipping dashboard creation.');
    }
  });
}

export type LLMEvent = {
  prompt?: string;
  response?: string;
  model?: string;
  tokens?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

// Internal: send any structured log object to Datadog Logs v2 intake
async function sendLog(entry: {
  message: string;
  status: 'info' | 'warn' | 'error';
  attributes?: Record<string, unknown>;
}): Promise<boolean> {
  if (!config.apiKey) return false;

  const site = config.site || 'datadoghq.com';
  // Datadog Logs API v2 — body must be an array
  const url = config.logsUrl || `https://http-intake.logs.${site}/api/v2/logs`;

  const payload = [
    {
      ddsource: 'mastra-llm',
      service: config.serviceName || 'mastra',
      ddtags: `env:${config.env ?? 'development'},hostname:${os.hostname()}`,
      message: entry.message,
      status: entry.status,
      ...(entry.attributes ?? {}),
    },
  ];

  try {
    const fetchFn = (globalThis as any).fetch ?? fetch;
    if (typeof fetchFn !== 'function') {
      console.error('[Datadog] fetch is not available in this runtime.');
      return false;
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res?.ok) {
      const body = await res?.text?.().catch(() => '');
      console.error(`[Datadog] Log intake responded ${res?.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Datadog] Failed to send log:', err);
    return false;
  }
}

// Send a custom metric to Datadog (series API)
async function sendMetric(metric: string, value: number, tags?: string[]): Promise<boolean> {
  if (!config.apiKey) return false;

  const site = config.site || 'datadoghq.com';
  const url = config.metricsUrl || `https://api.${site}/api/v1/series`;
  const ts = Math.floor(Date.now() / 1000);

  const payload = {
    series: [
      {
        metric,
        points: [[ts, value]],
        type: 'gauge',
        host: os.hostname(),
        tags: [...(tags ?? []), `service:${config.serviceName || 'mastra'}`, `env:${config.env ?? 'development'}`],
      },
    ],
  };

  try {
    const fetchFn = (globalThis as any).fetch ?? fetch;
    if (typeof fetchFn !== 'function') {
      console.error('[Datadog] fetch is not available in this runtime.');
      return false;
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res?.ok) {
      const body = await res?.text?.().catch(() => '');
      console.error(`[Datadog] Metric intake responded ${res?.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Datadog] Failed to send metric:', err);
    return false;
  }
}

// Create a minimal dashboard with a single timeseries for the custom metric
async function createMinimalDashboard(): Promise<boolean> {
  if (!config.apiKey || !config.applicationKey) return false;

  const site = config.site || 'datadoghq.com';
  const url = `https://api.${site}/api/v1/dashboard`;

  const payload = {
    title: `${config.serviceName || 'mastra'} LLM Metrics`,
    widgets: [
      {
        definition: {
          type: 'timeseries',
          requests: [
            {
              q: 'sum:mastra.llm_interactions{*}',
            },
          ],
          title: 'LLM Interactions',
        },
      },
    ],
    layout_type: 'ordered',
    description: 'Automatically created minimal dashboard for Mastra LLM metrics',
  };

  try {
    const fetchFn = (globalThis as any).fetch ?? fetch;
    if (typeof fetchFn !== 'function') {
      console.error('[Datadog] fetch is not available in this runtime.');
      return false;
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.apiKey,
        'DD-APPLICATION-KEY': config.applicationKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res?.ok) {
      const body = await res?.text?.().catch(() => '');
      console.error(`[Datadog] Dashboard create responded ${res?.status}: ${body}`);
      return false;
    }

    const json = await res.json().catch(() => null);
    console.info('[Datadog] Dashboard created:', json?.id ?? json);
    return true;
  } catch (err) {
    console.error('[Datadog] Failed to create dashboard:', err);
    return false;
  }
}

export async function recordLLMInteraction(evt: LLMEvent): Promise<boolean> {
  if (!config.apiKey) return false;

  const ok = await sendLog({
    message: 'llm_interaction',
    status: 'info',
    attributes: {
      model: evt.model,
      tokens: evt.tokens,
      durationMs: evt.durationMs,
      // user-facing content kept separate so it's easy to redact later
      prompt: evt.prompt,
      response: evt.response,
      ...evt.metadata,
    },
  });

  // best-effort: increment a custom metric for each interaction
  sendMetric('mastra.llm_interactions', 1, [evt.model ? `model:${evt.model}` : 'model:unknown']).catch(() => {});

  if (!ok) {
    console.error('[Datadog] Failed to forward LLM interaction log.');
  }

  return ok;
}

export default {
  initDatadogObservability,
  recordLLMInteraction,
};
