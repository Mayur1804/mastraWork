# How to Set Up Datadog Monitoring for a Mastra Project

This guide explains exactly how to connect a Mastra AI project to Datadog so you can monitor your AI agents, workflows, tool calls, HTTP requests, token usage, and errors — all in one place.

---

## What You Will Get

After following this guide, you will have two types of monitoring active in Datadog:

| Type | What It Shows | Where in Datadog |
|---|---|---|
| **APM (Application Performance Monitoring)** | Incoming HTTP requests to your Mastra server, latency, error rates, service maps | APM → Traces |
| **LLM Observability** | Every agent run, workflow step, tool call, model generation — with token counts, costs, inputs/outputs | LLM Observability → Traces |

---

## Prerequisites

### 1. A Datadog Account

- Sign up at https://datadoghq.com
- During signup, Datadog will ask which site/region you are in. This determines your `DD_SITE` value.
  - **US1 (default):** `datadoghq.com`
  - **US5:** `us5.datadoghq.com`
  - **EU:** `datadoghq.eu`
  - **US3:** `us3.datadoghq.com`
- After signup, go to: **Organization Settings → API Keys** → create a new API key. Save it.

### 2. Datadog Agent Installed on Your Machine

The Datadog Agent is a background service that runs on your computer and receives traces from your app, then forwards them to the Datadog cloud.

- Download from: https://docs.datadoghq.com/agent/
- On Windows, use the MSI installer.
- After installation, the agent runs automatically as a Windows service.
- Default trace receiver port: `localhost:8126` — your app sends traces here.
- To verify it is running: open a browser and go to http://localhost:5002 (the agent's local status page), or run `datadog-agent status` in a terminal.
- In the status output, look for the **APM** section. It should say `Status: Running` and `Receiver: localhost:8126`.

### 3. Node.js 22.x

- Some native Datadog modules have best compatibility with Node.js 22.
- Check your version: `node --version`
- If needed, download from https://nodejs.org

---

## Step-by-Step Implementation

### Step 1: Install the Required Packages

In your Mastra project root directory, run:

```bash
npm install dd-trace
npm install @mastra/datadog@latest
```

- `dd-trace` — Datadog's Node.js tracing library. Handles APM (HTTP request tracing).
- `@mastra/datadog` — Mastra's Datadog exporter. Handles LLM Observability (agent/tool/workflow span tracing).

### Step 2: Set Environment Variables

Create or update your `.env` file in the project root:

```env
# Your OpenAI or other LLM API key (already present in your project)
OPENAI_API_KEY=your-openai-api-key

# Datadog credentials
DD_API_KEY=your-datadog-api-key          # From Datadog: Org Settings → API Keys
DD_SITE=us5.datadoghq.com               # Your Datadog region/site
DD_ENV=development                       # Environment label: development, production, staging, etc.
DD_SERVICE=my-mastra-app                 # Name shown in Datadog for your service
DD_LLMOBS_ML_APP=my-mastra-app          # Groups all LLM spans under this app name in LLM Observability
```

> **Important:** `DD_SERVICE`, `DD_LLMOBS_ML_APP`, and `DD_SITE` are all required. If any are missing, traces will either not appear or appear under wrong names.

### Step 3: Update Your Mastra Entry File (`src/mastra/index.ts`)

This is the most important file. The order of code matters here. `dd-trace` **must** be imported and initialized before everything else, because it patches Node.js HTTP libraries at startup time.

Replace the content of your `src/mastra/index.ts` with this structure:

```typescript
// MUST be first — initializes APM tracing before any other module loads
import tracer from 'dd-trace';

tracer.init({
  service: process.env.DD_SERVICE || 'my-mastra-app',
  env: process.env.DD_ENV || 'production',
  version: process.env.DD_VERSION,
});

// All other imports come AFTER dd-trace initialization
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { DatadogExporter } from '@mastra/datadog';

// Import your own agents, workflows, scorers as usual
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },

  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      // DuckDB is required for metrics (token usage, durations) to persist
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),

  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),

  observability: new Observability({
    configs: {
      default: {
        serviceName: process.env.DD_SERVICE || 'my-mastra-app',
        exporters: [
          new DefaultExporter(),    // Saves traces to local storage for Mastra Studio
          new CloudExporter(),      // Sends to Mastra Cloud (only if MASTRA_CLOUD_ACCESS_TOKEN is set)
          new DatadogExporter({     // Sends LLM spans to Datadog LLM Observability
            mlApp: process.env.DD_LLMOBS_ML_APP!,
            apiKey: process.env.DD_API_KEY!,
            site: process.env.DD_SITE || 'datadoghq.com',
            env: process.env.DD_ENV || 'production',
          }),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts passwords, tokens, keys from spans
        ],
      },
    },
  }),

  // Tells the Mastra bundler not to bundle these packages
  // dd-trace uses native binary modules that cannot be bundled
  bundler: {
    externals: [
      'dd-trace',
      '@datadog/native-metrics',
      '@datadog/native-appsec',
      '@datadog/native-iast-taint-tracking',
      '@datadog/pprof',
    ],
  },
});
```

### Step 4: Start Your App

```bash
npm run dev
```

### Step 5: Send Some Requests

Make requests to your Mastra server — call an agent, run a workflow, call a tool. Without requests, there is nothing to trace.

For example if you have a weather agent, call it through the Mastra Playground at http://localhost:4111 or via the API.

### Step 6: Check Datadog

Allow 1–2 minutes for data to appear. Then:

- **APM:** Go to https://app.us5.datadoghq.com (replace `us5` with your site) → **APM** → **Traces**
- **LLM Observability:** Same site → **LLM Observability** → **Traces**

---

## Troubleshooting

### No traces in APM

- Verify the Datadog Agent is running: open http://localhost:5002 in a browser
- In the agent status, confirm APM shows `Receiver: localhost:8126`
- Make sure `dd-trace` import is the **very first line** in your entry file
- Check `DD_SERVICE` is set in `.env`

### No spans in LLM Observability

- Confirm `DD_LLMOBS_ML_APP` is set in `.env`
- Confirm `DD_API_KEY` is correct (check Datadog Org Settings → API Keys)
- Confirm `DD_SITE` matches your Datadog region exactly
- Verify `@mastra/datadog` is installed: `npm list @mastra/datadog`

### ABI mismatch errors on startup (native module errors)

If you see errors like `No native build was found for runtime=node abi=137`, this is a warning from dd-trace's optional native performance modules. These are **not required** — core tracing still works. You can safely ignore these warnings. To eliminate them, use Node.js 22.x.

### Traces appear but LLM Observability is empty

- Make sure you are looking at the correct Datadog site/region in the browser
- Agentless mode (what `DatadogExporter` uses) sends directly over HTTPS — it does NOT need the local Datadog Agent. But APM does need the agent.
- Wait a few minutes — LLM Observability can have a small ingestion delay

---

## What You Can See in Datadog

This section is a quick reference for developers who are new to Datadog and need to know exactly where to look for Mastra telemetry.

### APM Traces (HTTP / service performance)

1. Go to **APM → Traces** in Datadog.
2. Select `Service: my-mastra-app` (or the value of `DD_SERVICE`).
3. Apply `env:development` or your environment tag if configured.

Expected output:

- List of request traces (one line per request)
- Resource names like `POST /api/agents/weatherAgent/generate`
- Duration values (avg, p50/p95/p99)
- Error rate and status codes
- Flame graphs per trace

A single trace details pane includes:

- Root span: inbound HTTP call
- Child spans: Mastra internals (if instrumented by middleware), DB calls, external HTTP calls
- Timing breakdown and tags
- `Open in Metrics` link to related visible metric points

### LLM Observability Traces (Mastra spans)

1. Go to **AI Observability → Traces** (in Datadog UI, this may be labelled “LLM Observability”).
2. Select `ML App: my-mastra-app` (or the value of `DD_LLMOBS_ML_APP`).
3. Filter by `status:error` or `env:development` as needed.

Expected output:

- Span tree for each agent run (AGENT_RUN fully expanded)
- Span kinds:
  - `agent` for Mastra agent run
  - `workflow` for workflow runs
  - `tool` for tool calls / external API calls
  - `llm` for model generation steps
- Token usage fields: `inputTokens`, `outputTokens`, `estimatedCost`
- Prompt/text payloads for model requests and responses
- Error details at a span level (stack traces, exception message)

### Metrics Explorer (host and custom metrics)

1. Go to **Metrics → Explorer**.
2. Try queries:
   - `avg:system.cpu.user{*}` to view host CPU usage
   - `avg:mastra_agent_duration_ms{*}` for agent execution latency
   - `sum:mastra_model_total_output_tokens{*}` for token consumption

Expected output:

- Line chart with selected timespan (Past 1h, 5m, 24h)
- Aggregation controls (avg/max/p95)
- Group by tags e.g. `{host}`, `{service}`, `{env}`
- Split-screen detail for diagnostics

### Infrastructure / Host metrics

1. Go to **Infrastructure → Hosts**.
2. Filter by your hostname (e.g., `Mayur`).
3. View host CPU, memory, disk, network, and `datadog.agent.running` status.

Expected output:

- Host health summary and resource usage trends
- APM Trace Agent health and endpoint status (localhost:8126)
- Ability to link back to trace metrics from host graphs

### Quick checks when you see no data

- APM traces missing: confirm `dd-trace` initialization is first and Agent receiver is running on `localhost:8126`.
- LLM Observability missing: confirm `@mastra/datadog` exporter is configured and `DD_LLMOBS_ML_APP` is correct.
- Metrics missing: confirm `DefaultExporter` + DuckDB or in-memory storage is used.

---

## What Each Part Does (Summary)

| Code/Config | Purpose |
|---|---|
| `import tracer from 'dd-trace'` + `tracer.init()` | Starts APM. Must be first import. Auto-instruments HTTP. |
| `new DatadogExporter({...})` | Sends agent/workflow/tool spans to LLM Observability via HTTPS directly to Datadog |
| `new DefaultExporter()` | Saves traces locally to DuckDB for Mastra Studio dashboard |
| `bundler.externals` | Prevents Mastra's esbuild bundler from trying to bundle dd-trace's native binaries |
| `DD_SERVICE` | The name of your service shown in APM |
| `DD_LLMOBS_ML_APP` | Groups all your LLM spans under one app name in LLM Observability |
| `DD_SITE` | Which Datadog regional endpoint to send data to |
| Datadog Agent (localhost:8126) | Receives dd-trace APM spans and forwards them to Datadog cloud |
