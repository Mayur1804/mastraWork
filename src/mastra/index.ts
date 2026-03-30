
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { initDatadogObservability, recordLLMInteraction } from './observability/datadog-llm';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { packingAgent } from './agents/packing-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent, packingAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into persistent file storage
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});

// Initialize Datadog LLM Observability (no-op if `DD_API_KEY` is not set)
initDatadogObservability({
  apiKey: process.env.DD_API_KEY,
  applicationKey: process.env.DD_APPLICATION_KEY,
  site: process.env.DD_SITE || 'datadoghq.com',
  serviceName: 'mastra',
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
});

// Lightweight fetch wrapper to capture LLM calls (prompts/responses/usage)
// Intercepts requests that look like LLM provider calls and forwards a small
// structured event to Datadog via `recordLLMInteraction`.
(() => {
  try {
    const origFetch = (globalThis as any).fetch;
    if (typeof origFetch !== 'function') return;

    (globalThis as any).fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url;
      let bodyText: string | undefined;
      if (init?.body && typeof init.body === 'string') bodyText = init.body;
      else if (init?.body && typeof init.body !== 'string') {
        try { bodyText = JSON.stringify(init.body); } catch {}
      } else if (typeof input !== 'string' && input && input.body) {
        try { bodyText = String(input.body); } catch {}
      }

      let parsedReq: any | undefined;
      if (bodyText) {
        try { parsedReq = JSON.parse(bodyText); } catch {}
      }

      const looksLikeLLM = (() => {
        if (!url) return false;
        const u = String(url).toLowerCase();
        if (u.includes('openai') || u.includes('anthropic') || u.includes('/v1/chat') || u.includes('/v1/completions') || u.includes('/v1/embeddings')) return true;
        if (parsedReq) {
          if (parsedReq.messages || parsedReq.prompt || parsedReq.input || parsedReq.instances) return true;
        }
        return false;
      })();

      if (!looksLikeLLM) {
        return origFetch(input, init);
      }

      const start = Date.now();
      let resp: any;
      try {
        resp = await origFetch(input, init);
      } catch (err) {
        try {
          // best-effort: record a failed call
          await recordLLMInteraction({
            model: parsedReq?.model,
            prompt: parsedReq?.prompt ?? parsedReq?.messages ? (typeof parsedReq?.messages === 'string' ? parsedReq.messages : JSON.stringify(parsedReq.messages)) : undefined,
            response: undefined,
            durationMs: Date.now() - start,
            metadata: { url, error: String(err) },
          });
        } catch {}
        throw err;
      }

      try {
        const ct = resp?.headers?.get ? resp.headers.get('content-type') : undefined;
        let json: any | undefined;
        if (ct && ct.includes('application/json')) {
          try { json = await resp.clone().json(); } catch {}
        }

        const usage = json?.usage ?? json?.meta?.usage ?? json?.token_usage;
        const tokens = usage?.total_tokens ?? usage?.total ?? usage?.tokens ?? undefined;
        const modelName = parsedReq?.model ?? json?.model ?? undefined;

        let respSnippet: string | undefined;
        if (json) {
          try {
            if (json.choices) respSnippet = JSON.stringify(json.choices?.[0]);
            else respSnippet = JSON.stringify(json);
          } catch {}
        }

        const promptSnippet = parsedReq?.prompt ?? (parsedReq?.messages ? (typeof parsedReq.messages === 'string' ? parsedReq.messages : JSON.stringify(parsedReq.messages)) : undefined);

        // best-effort, do not await blocking the fetch return
        recordLLMInteraction({
          model: modelName,
          prompt: promptSnippet,
          response: respSnippet,
          tokens,
          durationMs: Date.now() - start,
          metadata: { url },
        }).catch(() => {});
      } catch {}

      return resp;
    };
  } catch (_) {}
})();
