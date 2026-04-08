create a variable that generate a unique ID called as  TestID. Pass that TestID as metadata to observability platform so that I can track entire trace with that ID. Below is reference. 


# Tracing

Tracing provides specialized monitoring and debugging for the AI-related operations in your application. When enabled, Mastra automatically creates traces for agent runs, LLM generations, tool calls, and workflow steps with AI-specific context and metadata.

Unlike traditional application tracing, Tracing focuses specifically on understanding your AI pipeline — capturing token usage, model parameters, tool execution details, and conversation flows. This makes it easier to debug issues, optimize performance, and understand how your AI systems behave in production.

## How it works

Traces are created by:

- **Configure exporters** → send trace data to observability platforms
- **Set sampling strategies** → control which traces are collected
- **Run agents and workflows** → Mastra auto-instruments them with Tracing

## Configuration

### Basic Config

```ts
import { Mastra } from '@mastra/core'
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db', // Storage is required for tracing
  }),
})
```

This configuration includes:

- **Service Name**: `"mastra"` - identifies your service in traces

- **Sampling**: `"always"` by default (100% of traces)

- **Exporters**:

  - `DefaultExporter` - Persists traces to your configured storage for Studio
  - `CloudExporter` - Sends traces to Mastra Cloud (requires `MASTRA_CLOUD_ACCESS_TOKEN`)

- **Span Output Processors**: `SensitiveDataFilter` - Redacts sensitive fields

## Exporters

Exporters determine where your trace data is sent and how it's stored. They integrate with your existing observability stack, support data residency requirements, and can be optimized for cost and performance. You can use multiple exporters simultaneously to send the same trace data to different destinations — for example, storing detailed traces locally for debugging while sending sampled data to a cloud provider for production monitoring.

### Internal Exporters

Mastra provides two built-in exporters:

- **[Default](https://mastra.ai/docs/observability/tracing/exporters/default)** - Persists traces to local storage for viewing in Studio
- **[Cloud](https://mastra.ai/docs/observability/tracing/exporters/cloud)** - Sends traces to Mastra Cloud for production monitoring and collaboration

### External Exporters

In addition to the internal exporters, Mastra supports integration with popular observability platforms. These exporters allow you to leverage your existing monitoring infrastructure and take advantage of platform-specific features like alerting, dashboards, and correlation with other application metrics.

- **[Arize](https://mastra.ai/docs/observability/tracing/exporters/arize)** - Exports traces to Arize Phoenix or Arize AX using OpenInference semantic conventions
- **[Braintrust](https://mastra.ai/docs/observability/tracing/exporters/braintrust)** - Exports traces to Braintrust's eval and observability platform
- **[Datadog](https://mastra.ai/docs/observability/tracing/exporters/datadog)** - Sends traces to Datadog APM via OTLP for full-stack observability with AI tracing
- **[Laminar](https://mastra.ai/docs/observability/tracing/exporters/laminar)** - Sends traces to Laminar via OTLP/HTTP (protobuf) with Laminar-native span attributes + scorer support
- **[Langfuse](https://mastra.ai/docs/observability/tracing/exporters/langfuse)** - Sends traces to the Langfuse open-source LLM engineering platform
- **[LangSmith](https://mastra.ai/docs/observability/tracing/exporters/langsmith)** - Pushes traces into LangSmith's observability and evaluation toolkit
- **[PostHog](https://mastra.ai/docs/observability/tracing/exporters/posthog)** - Sends traces to PostHog for AI analytics and product insights
- **[Sentry](https://mastra.ai/docs/observability/tracing/exporters/sentry)** - Sends traces to Sentry for AI tracing and monitoring using OpenTelemetry semantic conventions
- **[OpenTelemetry](https://mastra.ai/docs/observability/tracing/exporters/otel)** - Deliver traces to any OpenTelemetry-compatible observability system
  - Supports: Dash0, MLflow, New Relic, SigNoz, Traceloop, Zipkin, and others!

## Bridges

Bridges provide bidirectional integration with external tracing systems. Unlike exporters that send trace data to external platforms, bridges create native spans in external systems and inherit context from them. This enables Mastra operations to participate in existing distributed traces.

- **[OpenTelemetry Bridge](https://mastra.ai/docs/observability/tracing/bridges/otel)** - Integrate with existing OpenTelemetry infrastructure

### Bridges vs Exporters

| Feature                                  | Bridges                      | Exporters                 |
| ---------------------------------------- | ---------------------------- | ------------------------- |
| Creates native spans in external systems | Yes                          | No                        |
| Inherits context from external systems   | Yes                          | No                        |
| Sends data to backends                   | Via external SDK             | Directly                  |
| Use case                                 | Existing distributed tracing | Standalone Mastra tracing |

You can use both together — a bridge for context propagation and exporters to send traces to additional destinations.

## Sampling strategies

Sampling allows you to control which traces are collected, helping you balance between observability needs and resource costs. In production environments with high traffic, collecting every trace can be expensive and unnecessary. Sampling strategies let you capture a representative subset of traces while ensuring you don't miss critical information about errors or important operations.

Mastra supports four sampling strategies:

### Always Sample

Collects 100% of traces. Best for development, debugging, or low-traffic scenarios where you need complete visibility.

```ts
sampling: {
  type: 'always'
}
```

### Never Sample

Disables tracing entirely. Useful for specific environments where tracing adds no value or when you need to temporarily disable tracing without removing configuration.

```ts
sampling: {
  type: 'never'
}
```

### Ratio-Based Sampling

Randomly samples a percentage of traces. Ideal for production environments where you want statistical insights without the cost of full tracing. The probability value ranges from 0 (no traces) to 1 (all traces).

```ts
sampling: {
  type: 'ratio',
  probability: 0.1  // Sample 10% of traces
}
```

### Custom Sampling

Implements your own sampling logic based on request context, metadata, or business rules. Perfect for complex scenarios like sampling based on user tier, request type, or error conditions.

```ts
sampling: {
  type: 'custom',
  sampler: (options) => {
    // Sample premium users at higher rate
    if (options?.metadata?.userTier === 'premium') {
      return Math.random() < 0.5; // 50% sampling
    }

    // Default 1% sampling for others
    return Math.random() < 0.01;
  }
}
```

### Complete Example

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      '10_percent': {
        serviceName: 'my-service',
        // Sample 10% of traces
        sampling: {
          type: 'ratio',
          probability: 0.1,
        },
        exporters: [new DefaultExporter()],
      },
    },
  }),
})
```

## Multi-config setup

Complex applications often require different tracing configurations for different scenarios. You might want detailed traces with full sampling during development, sampled traces sent to external providers in production, and specialized configurations for specific features or customer segments. The `configSelector` function enables dynamic configuration selection at runtime, allowing you to route traces based on request context, environment variables, feature flags, or any custom logic.

This approach is particularly valuable when:

- Running A/B tests with different observability requirements
- Providing enhanced debugging for specific customers or support cases
- Gradually rolling out new tracing providers without affecting existing monitoring
- Optimizing costs by using different sampling rates for different request types
- Maintaining separate trace streams for compliance or data residency requirements

> **Info:** Note that only a single config can be used for a specific execution. But a single config can send data to multiple exporters simultaneously.

### Dynamic Configuration Selection

Use `configSelector` to choose the appropriate tracing configuration based on request context:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      langfuse: {
        serviceName: 'langfuse-service',
        exporters: [langfuseExporter],
      },
      braintrust: {
        serviceName: 'braintrust-service',
        exporters: [braintrustExporter],
      },
      debug: {
        serviceName: 'debug-service',
        sampling: { type: 'always' },
        exporters: [new DefaultExporter()],
      },
    },
    configSelector: (context, availableTracers) => {
      // Use debug config for support requests
      if (context.requestContext?.get('supportMode')) {
        return 'debug'
      }

      // Route specific customers to different providers
      const customerId = context.requestContext?.get('customerId')
      if (customerId && premiumCustomers.includes(customerId)) {
        return 'braintrust'
      }

      // Route specific requests to langfuse
      if (context.requestContext?.get('useExternalTracing')) {
        return 'langfuse'
      }

      throw new Error('no config found')
    },
  }),
})
```

### Environment-Based Configuration

A common pattern is to select configurations based on deployment environment:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      development: {
        serviceName: 'my-service-dev',
        sampling: { type: 'always' },
        exporters: [new DefaultExporter()],
      },
      staging: {
        serviceName: 'my-service-staging',
        sampling: { type: 'ratio', probability: 0.5 },
        exporters: [langfuseExporter],
      },
      production: {
        serviceName: 'my-service-prod',
        sampling: { type: 'ratio', probability: 0.01 },
        exporters: [cloudExporter, langfuseExporter],
      },
    },
    configSelector: (context, availableTracers) => {
      const env = process.env.NODE_ENV || 'development'
      return env
    },
  }),
})
```

### Common Configuration Patterns & Troubleshooting

#### Maintaining Studio and Cloud Access

When adding external exporters, include `DefaultExporter` and `CloudExporter` to maintain access to Studio and Mastra Cloud:

```ts
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from '@mastra/observability'
import { ArizeExporter } from '@mastra/arize'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      production: {
        serviceName: 'my-service',
        exporters: [
          new ArizeExporter({
            endpoint: process.env.PHOENIX_ENDPOINT,
            apiKey: process.env.PHOENIX_API_KEY,
          }),
          new DefaultExporter(), // Keep Studio access
          new CloudExporter(), // Keep Cloud access
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
})
```

This configuration sends traces to all three destinations simultaneously:

- **Arize Phoenix/AX** for external observability
- **DefaultExporter** for Studio
- **CloudExporter** for Mastra Cloud dashboard

> **Info:** Remember: A single trace can be sent to multiple exporters. You don't need separate configs for each exporter unless you want different sampling rates or processors.

## Adding custom metadata

Custom metadata allows you to attach additional context to your traces, making it easier to debug issues and understand system behavior in production. Metadata can include business logic details, performance metrics, user context, or any information that helps you understand what happened during execution.

You can add metadata to any span using the tracing context:

```ts
execute: async (inputData, context) => {
  const startTime = Date.now()
  const response = await fetch(inputData.endpoint)

  // Add custom metadata to the current span
  context?.tracingContext.currentSpan?.update({
    metadata: {
      apiStatusCode: response.status,
      endpoint: inputData.endpoint,
      responseTimeMs: Date.now() - startTime,
      userTier: inputData.userTier,
      region: process.env.AWS_REGION,
    },
  })

  return await response.json()
}
```

Metadata set here will be shown in all configured exporters.

### Automatic Metadata from `RequestContext`

Instead of manually adding metadata to each span, you can configure Mastra to automatically extract values from RequestContext and attach them as metadata to all spans in a trace. This is useful for consistently tracking user identifiers, environment information, feature flags, or any request-scoped data across your entire trace.

#### Configuration-Level Extraction

Define which RequestContext keys to extract in your tracing configuration. These keys will be automatically included as metadata for all spans created with this configuration:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        requestContextKeys: ['userId', 'environment', 'tenantId'],
        exporters: [new DefaultExporter()],
      },
    },
  }),
})
```

Now when you execute agents or workflows with a RequestContext, these values are automatically extracted:

```ts
const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('tenantId', 'tenant-456')

// All spans in this trace automatically get userId, environment, and tenantId metadata
const result = await agent.generate('Hello', {
  requestContext,
})
```

#### Per-Request Additions

You can add trace-specific keys using `tracingOptions.requestContextKeys`. These are merged with the configuration-level keys:

```ts
const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('experimentId', 'exp-789')

const result = await agent.generate('Hello', {
  requestContext,
  tracingOptions: {
    requestContextKeys: ['experimentId'], // Adds to configured keys
  },
})

// All spans now have: userId, environment, AND experimentId
```

#### Nested Value Extraction

Use dot notation to extract nested values from RequestContext:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        requestContextKeys: ['user.id', 'session.data.experimentId'],
        exporters: [new DefaultExporter()],
      },
    },
  }),
})

const requestContext = new RequestContext()
requestContext.set('user', { id: 'user-456', name: 'John Doe' })
requestContext.set('session', { data: { experimentId: 'exp-999' } })

// Metadata will include: { user: { id: 'user-456' }, session: { data: { experimentId: 'exp-999' } } }
```

#### How it works

1. **TraceState Computation**: At the start of a trace (root span creation), Mastra computes which keys to extract by merging configuration-level and per-request keys
2. **Automatic Extraction**: Root spans (agent runs, workflow executions) automatically extract metadata from RequestContext
3. **Child Span Extraction**: Child spans can also extract metadata if you pass `requestContext` when creating them
4. **Metadata Precedence**: Explicit metadata passed to span options always takes precedence over extracted metadata

### Adding Tags to Traces

Tags are string labels that help you categorize and filter traces. Unlike metadata (which contains structured key-value data), tags are plain strings designed for quick filtering and organization.

Use `tracingOptions.tags` to add tags when executing agents or workflows:

```ts
// With agents
const result = await agent.generate('Hello', {
  tracingOptions: {
    tags: ['production', 'experiment-v2', 'user-request'],
  },
})

// With workflows
const run = await mastra.getWorkflow('myWorkflow').createRun()
const result = await run.start({
  inputData: { data: 'process this' },
  tracingOptions: {
    tags: ['batch-processing', 'priority-high'],
  },
})
```

#### How Tags Work

- **Root span only**: Tags are applied only to the root span of a trace (the agent run or workflow run span)

- **Widely supported**: Tags are supported by most exporters for filtering and searching traces:

  - **Braintrust** - Native `tags` field
  - **Langfuse** - Native `tags` field on traces
  - **ArizeExporter** - `tag.tags` OpenInference attribute
  - **OtelExporter** - `mastra.tags` span attribute
  - **OtelBridge** - `mastra.tags` span attribute

- **Combinable with metadata**: You can use both `tags` and `metadata` in the same `tracingOptions`

```ts
const result = await agent.generate([{ role: 'user', content: 'Analyze this' }], {
  tracingOptions: {
    tags: ['production', 'analytics'],
    metadata: { userId: 'user-123', experimentId: 'exp-456' },
  },
})
```

#### Common Tag Patterns

- **Environment**: `"production"`, `"staging"`, `"development"`
- **Feature flags**: `"feature-x-enabled"`, `"beta-user"`
- **Request types**: `"user-request"`, `"batch-job"`, `"scheduled-task"`
- **Priority levels**: `"priority-high"`, `"priority-low"`
- **Experiments**: `"experiment-v1"`, `"control-group"`, `"treatment-a"`

### Hiding Sensitive Input/Output

When processing sensitive data, you may want to prevent input and output values from being logged to your observability platforms. Use `hideInput` and `hideOutput` in `tracingOptions` to exclude this data from all spans in a trace:

```ts
// Hide input data (e.g., user credentials, PII)
const result = await agent.generate([{ role: 'user', content: 'Process this sensitive data' }], {
  tracingOptions: {
    hideInput: true, // Input will be hidden from all spans
  },
})

// Hide output data (e.g., generated secrets, confidential results)
const result = await agent.generate([{ role: 'user', content: 'Generate API keys' }], {
  tracingOptions: {
    hideOutput: true, // Output will be hidden from all spans
  },
})

// Hide both input and output
const result = await agent.generate([{ role: 'user', content: 'Handle confidential request' }], {
  tracingOptions: {
    hideInput: true,
    hideOutput: true,
  },
})
```

#### How it works

- **Trace-wide effect**: When set on the root span, these options apply to all child spans in the trace (tool calls, model generations, etc.)
- **Export-time filtering**: The data is still available internally during execution but is excluded when spans are exported to observability platforms
- **Combinable with other options**: You can use `hideInput`/`hideOutput` alongside `tags`, `metadata`, and other `tracingOptions`

```ts
const result = await agent.generate([{ role: 'user', content: 'Sensitive operation' }], {
  tracingOptions: {
    hideInput: true,
    hideOutput: true,
    tags: ['sensitive-operation', 'pii-handling'],
    metadata: { operationType: 'credential-processing' },
  },
})
```

> **Tip:** For more granular control over sensitive data, consider using the [Sensitive Data Filter](https://mastra.ai/docs/observability/tracing/processors/sensitive-data-filter) processor, which can redact specific fields (like passwords, tokens, and keys) while preserving the rest of the input/output.

#### Child Spans and Metadata Extraction

When creating child spans within tools or workflow steps, you can pass the `requestContext` parameter to enable metadata extraction:

```ts
execute: async (inputData, context) => {
  // Create child span WITH requestContext - gets metadata extraction
  const dbSpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'database-query',
    requestContext: context?.requestContext, // Pass to enable metadata extraction
  })

  const results = await db.query('SELECT * FROM users')
  dbSpan?.end({ output: results })

  // Or create child span WITHOUT requestContext - no metadata extraction
  const cacheSpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'cache-check',
    // No requestContext - won't extract metadata
  })

  return results
}
```

This gives you fine-grained control over which child spans include RequestContext metadata. Root spans (agent/workflow executions) always extract metadata automatically, while child spans only extract when you explicitly pass `requestContext`.

## Creating child spans

Child spans allow you to track fine-grained operations within your workflow steps or tools. They provide visibility into sub-operations like database queries, API calls, file operations, or complex calculations. This hierarchical structure helps you identify performance bottlenecks and understand the exact sequence of operations.

Create child spans inside a tool call or workflow step to track specific operations:

```ts
execute: async (inputData, context) => {
  // Create another child span for the main database operation
  const querySpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'database-query',
    input: { query: inputData.query },
    metadata: { database: 'production' },
  })

  try {
    const results = await db.query(inputData.query)
    querySpan?.end({
      output: results.data,
      metadata: {
        rowsReturned: results.length,
        queryTimeMs: results.executionTime,
        cacheHit: results.fromCache,
      },
    })
    return results
  } catch (error) {
    querySpan?.error({
      error,
      metadata: { retryable: isRetryableError(error) },
    })
    throw error
  }
}
```

Child spans automatically inherit the trace context from their parent, maintaining the relationship hierarchy in your observability platform.

## Span formatting

Mastra provides two ways to transform span data before it reaches your observability platform: **span processors** and **custom span formatters**. Both allow you to modify, filter, or enrich trace data, but they operate at different levels and serve different purposes.

| Feature             | Span Processors                 | Custom Span Formatters                         |
| ------------------- | ------------------------------- | ---------------------------------------------- |
| Configuration level | Observability config            | Per-exporter                                   |
| Operates on         | Internal `Span` object          | Exported `ExportedSpan` data                   |
| Applies to          | All exporters                   | Single exporter                                |
| Async support       | No                              | Yes                                            |
| Use case            | Security, filtering, enrichment | Platform-specific formatting, async enrichment |

Use **span processors** for synchronous transformations that should apply to all exporters (like redacting sensitive data). Use **custom span formatters** when different exporters need different representations of the same data (like plain text for one platform and structured data for another), or when you need to perform asynchronous operations like fetching data from external APIs.

### Span Processors

Span processors transform, filter, or enrich trace data before it's exported. They act as a pipeline between span creation and export, enabling you to modify spans for security, compliance, or debugging purposes. Processors run once and affect all exporters.

#### Built-in Processors

- [Sensitive Data Filter](https://mastra.ai/docs/observability/tracing/processors/sensitive-data-filter) redacts sensitive information. It's enabled in the default observability config.

#### Creating Custom Processors

You can create custom span processors by implementing the `SpanOutputProcessor` interface. Here's a basic example that converts all input text in spans to lowercase:

```ts
import type { SpanOutputProcessor, AnySpan } from '@mastra/observability'

export class LowercaseInputProcessor implements SpanOutputProcessor {
  name = 'lowercase-processor'

  process(span: AnySpan): AnySpan {
    span.input = `${span.input}`.toLowerCase()
    return span
  }

  async shutdown(): Promise<void> {
    // Cleanup if needed
  }
}

// Use the custom processor
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      development: {
        spanOutputProcessors: [new LowercaseInputProcessor(), new SensitiveDataFilter()],
        exporters: [new DefaultExporter()],
      },
    },
  }),
})
```

Processors are executed in the order they're defined, allowing you to chain multiple transformations. Common use cases include:

- Redacting sensitive data (passwords, tokens, API keys)
- Adding environment-specific metadata
- Filtering out spans based on criteria
- Normalizing data formats
- Enriching spans with business context

### Custom Span Formatters

Custom span formatters transform how spans appear in specific observability platforms. Unlike span processors, formatters are configured per-exporter, allowing different formatting for different destinations. Formatters support both synchronous and asynchronous operations.

#### Use cases

- **Extract plain text from AI SDK messages** - Convert structured message arrays to readable text
- **Transform input/output formats** - Customize how data displays in specific platforms
- **Platform-specific field mapping** - Add or remove fields based on platform requirements
- **Async data enrichment** - Fetch additional context from external APIs or databases

#### Configuration

Add a `customSpanFormatter` to any exporter configuration:

```ts
import { BraintrustExporter } from '@mastra/braintrust'
import { LangfuseExporter } from '@mastra/langfuse'
import { SpanType } from '@mastra/core/observability'
import type { CustomSpanFormatter } from '@mastra/core/observability'

// Formatter that extracts plain text from AI messages
const plainTextFormatter: CustomSpanFormatter = span => {
  if (span.type === SpanType.AGENT_RUN && Array.isArray(span.input)) {
    const userMessage = span.input.find(m => m.role === 'user')
    return {
      ...span,
      input: userMessage?.content ?? span.input,
    }
  }
  return span
}

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        exporters: [
          // Braintrust gets plain text formatting
          new BraintrustExporter({
            customSpanFormatter: plainTextFormatter,
          }),
          // Langfuse keeps the original structured format
          new LangfuseExporter(),
        ],
      },
    },
  }),
})
```

#### Chaining Multiple Formatters

Use `chainFormatters` to combine multiple formatters. Chains support both sync and async formatters:

```ts
import { chainFormatters } from '@mastra/observability'

const inputFormatter: CustomSpanFormatter = span => ({
  ...span,
  input: extractPlainText(span.input),
})

const outputFormatter: CustomSpanFormatter = span => ({
  ...span,
  output: extractPlainText(span.output),
})

const exporter = new BraintrustExporter({
  customSpanFormatter: chainFormatters([inputFormatter, outputFormatter]),
})
```

#### Async Formatters

Custom span formatters support asynchronous operations, enabling use cases like fetching data from external APIs or databases to enrich your spans:

```ts
import type { CustomSpanFormatter } from '@mastra/core/observability'

// Async formatter that enriches spans with user data
const userEnrichmentFormatter: CustomSpanFormatter = async span => {
  const userId = span.metadata?.userId
  if (!userId) return span

  // Fetch user data from your API or database
  const userData = await fetchUserData(userId)

  return {
    ...span,
    metadata: {
      ...span.metadata,
      userName: userData.name,
      userEmail: userData.email,
      department: userData.department,
    },
  }
}

// Async formatter that looks up additional context
const contextEnrichmentFormatter: CustomSpanFormatter = async span => {
  if (span.type !== SpanType.AGENT_RUN) return span

  // Fetch experiment configuration
  const experimentConfig = await getExperimentConfig(span.metadata?.experimentId)

  return {
    ...span,
    metadata: {
      ...span.metadata,
      experimentVariant: experimentConfig?.variant,
      experimentGroup: experimentConfig?.group,
    },
  }
}

// Use async formatters with an exporter
const exporter = new BraintrustExporter({
  customSpanFormatter: userEnrichmentFormatter,
})

// Or chain sync and async formatters together
const exporter = new LangfuseExporter({
  customSpanFormatter: chainFormatters([
    plainTextFormatter, // sync
    userEnrichmentFormatter, // async
    contextEnrichmentFormatter, // async
  ]),
})
```

> **Note:** Async formatters add latency to span export. Keep async operations fast (under 100ms) to avoid slowing down your application. Consider using caching for frequently accessed data.

## Serialization options

Serialization options control how span data (input, output, and attributes) is truncated before export. This is useful when working with large payloads, deeply nested objects, or when you need to optimize trace storage.

### Configuration

Add `serializationOptions` to your observability configuration:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        serializationOptions: {
          maxStringLength: 2048, // Maximum length for string values (default: 1024)
          maxDepth: 10, // Maximum depth for nested objects (default: 6)
          maxArrayLength: 100, // Maximum number of items in arrays (default: 50)
          maxObjectKeys: 75, // Maximum number of keys in objects (default: 50)
        },
        exporters: [new DefaultExporter()],
      },
    },
  }),
})
```

### Available Options

| Option            | Default | Description                                                      |
| ----------------- | ------- | ---------------------------------------------------------------- |
| `maxStringLength` | 1024    | Maximum length for string values. Longer strings are truncated.  |
| `maxDepth`        | 6       | Maximum depth for nested objects. Deeper levels are omitted.     |
| `maxArrayLength`  | 50      | Maximum number of items in arrays. Additional items are omitted. |
| `maxObjectKeys`   | 50      | Maximum number of keys in objects. Additional keys are omitted.  |

### Use cases

**Increasing limits for debugging**: If your agents or tools work with large documents, API responses, or data structures, increase these limits to capture more context in your traces:

```ts
serializationOptions: {
  maxStringLength: 8192,  // Capture longer text content
  maxDepth: 12,           // Handle deeply nested JSON responses
  maxArrayLength: 200,    // Keep more items from large lists
}
```

**Reducing trace size for production**: Lower these values to reduce storage costs and improve performance when you don't need full payload visibility:

```ts
serializationOptions: {
  maxStringLength: 256,   // Truncate strings aggressively
  maxDepth: 3,            // Shallow object representation
  maxArrayLength: 10,     // Keep only first few items
  maxObjectKeys: 20,      // Limit object keys
}
```

All options are optional — if not specified, they fall back to the defaults shown above.

## Retrieving trace IDs

When you execute agents or workflows with tracing enabled, the response includes a `traceId` that you can use to look up the full trace in your observability platform. This is useful for debugging, customer support, or correlating traces with other events in your system.

### Agent Trace IDs

Both `generate` and `stream` methods return the trace ID in their response:

```ts
// Using generate
const result = await agent.generate('Hello')

console.log('Trace ID:', result.traceId)

// Using stream
const streamResult = await agent.stream('Tell me a story')

console.log('Trace ID:', streamResult.traceId)
```

### Workflow Trace IDs

Workflow executions also return trace IDs:

```ts
// Create a workflow run
const run = await mastra.getWorkflow('myWorkflow').createRun()

// Start the workflow
const result = await run.start({
  inputData: { data: 'process this' },
})

console.log('Trace ID:', result.traceId)

// Or stream the workflow
const { stream, getWorkflowState } = run.stream({
  inputData: { data: 'process this' },
})

// Get the final state which includes the trace ID
const finalState = await getWorkflowState()
console.log('Trace ID:', finalState.traceId)
```

### Using Trace IDs

Once you have a trace ID, you can:

1. **Look up traces in Studio**: Navigate to the traces view and search by ID
2. **Query traces in external platforms**: Use the ID in Langfuse, Braintrust, MLflow, or your observability platform
3. **Correlate with logs**: Include the trace ID in your application logs for cross-referencing
4. **Share for debugging**: Provide trace IDs to support teams or developers for investigation

The trace ID is only available when tracing is enabled. If tracing is disabled or sampling excludes the request, `traceId` will be `undefined`.

## Integrating with external tracing systems

When running Mastra agents or workflows within applications that have existing distributed tracing (OpenTelemetry, Datadog, etc.), you can connect Mastra traces to your parent trace context. This creates a unified view of your entire request flow, making it easier to understand how Mastra operations fit into the broader system.

### Passing External Trace IDs

Use the `tracingOptions` parameter to specify the trace context from your parent system:

```ts
// Get trace context from your existing tracing system
const parentTraceId = getCurrentTraceId() // Your tracing system
const parentSpanId = getCurrentSpanId() // Your tracing system

// Execute Mastra operations as part of the parent trace
const result = await agent.generate('Analyze this data', {
  tracingOptions: {
    traceId: parentTraceId,
    parentSpanId: parentSpanId,
  },
})

// The Mastra trace will now appear as a child in your distributed trace
```

### OpenTelemetry Integration

Integration with OpenTelemetry allows Mastra traces to appear seamlessly in your existing observability platform:

```ts
import { trace } from '@opentelemetry/api'

// Get the current OpenTelemetry span
const currentSpan = trace.getActiveSpan()
const spanContext = currentSpan?.spanContext()

if (spanContext) {
  const result = await agent.generate(userMessage, {
    tracingOptions: {
      traceId: spanContext.traceId,
      parentSpanId: spanContext.spanId,
    },
  })
}
```

### Workflow Integration

Workflows support the same pattern for trace propagation:

```ts
const workflow = mastra.getWorkflow('data-pipeline')
const run = await workflow.createRun()

const result = await run.start({
  inputData: { data: '...' },
  tracingOptions: {
    traceId: externalTraceId,
    parentSpanId: externalSpanId,
  },
})
```

### ID Format Requirements

Mastra validates trace and span IDs to ensure compatibility:

- **Trace IDs**: 1-32 hexadecimal characters (OpenTelemetry uses 32)
- **Span IDs**: 1-16 hexadecimal characters (OpenTelemetry uses 16)

Invalid IDs are handled gracefully — Mastra logs an error and continues:

- Invalid trace ID → generates a new trace ID
- Invalid parent span ID → ignores the parent relationship

This ensures tracing never crashes your application, even with malformed input.

### Example: Express Middleware

Here's a complete example showing trace propagation in an Express application:

```ts
import { trace } from '@opentelemetry/api'
import express from 'express'

const app = express()

app.post('/api/analyze', async (req, res) => {
  // Get current OpenTelemetry context
  const currentSpan = trace.getActiveSpan()
  const spanContext = currentSpan?.spanContext()

  const result = await agent.generate(req.body.message, {
    tracingOptions: spanContext
      ? {
          traceId: spanContext.traceId,
          parentSpanId: spanContext.spanId,
        }
      : undefined,
  })

  res.json(result)
})
```

This creates a single distributed trace that includes both the HTTP request handling and the Mastra agent execution, viewable in your observability platform of choice.

## Flushing traces in serverless environments

In serverless environments like Vercel's fluid compute, AWS Lambda, or Cloudflare Workers, runtime instances can be reused across multiple requests. The `flush()` method allows you to ensure all buffered spans are exported before the runtime terminates, without shutting down the exporter (which would prevent future exports).

> **Storage requirements:** Serverless environments have ephemeral filesystems. Use external storage instead of local file storage (`file:./mastra.db`). See the [Vercel deployment guide](https://mastra.ai/guides/deployment/vercel) for a complete setup example.

### Using `flush()`

Call `flush()` on the observability instance to flush all exporters:

```ts
// Get the observability instance from Mastra
const observability = mastra.getObservability()

// Flush all buffered spans to all exporters
await observability.flush()
```

### When to Use `flush()`

Use `flush()` in these scenarios:

- **End of serverless function execution**: Ensure spans are exported before the runtime is paused or terminated
- **Before long-running operations**: Flush accumulated spans before a potentially slow operation
- **Periodic flushing**: In long-running processes, periodically flush to ensure timely data availability

```ts
// Example: Vercel serverless function
export async function POST(req: Request) {
  const result = await agent.generate([{ role: 'user', content: await req.text() }])

  // Ensure spans are exported before function completes
  const observability = mastra.getObservability()
  await observability.flush()

  return Response.json(result)
}
```

### `flush()` vs `shutdown()`

| Method       | Behavior                                      | Use Case                                   |
| ------------ | --------------------------------------------- | ------------------------------------------ |
| `flush()`    | Exports buffered spans, keeps exporter active | Serverless environments, periodic flushing |
| `shutdown()` | Exports buffered spans, releases resources    | Application shutdown, graceful termination |

Use `flush()` when you need to ensure data is exported but want to keep the exporter ready for future requests. Use `shutdown()` only when the application is terminating.

## What gets traced

Mastra automatically creates spans for:

### Agent Operations

- **Agent runs** - Complete execution with instructions and tools
- **LLM calls** - Model interactions with tokens and parameters
- **Tool executions** - Function calls with inputs and outputs
- **Memory operations** - Thread and semantic recall

### Workflow Operations

- **Workflow runs** - Full execution from start to finish
- **Individual steps** - Step processing with inputs/outputs
- **Control flow** - Conditionals, loops, parallel execution
- **Wait operations** - Delays and event waiting

## See also

### Reference Documentation

- [Configuration API](https://mastra.ai/reference/observability/tracing/configuration) - ObservabilityConfig details
- [Tracing Classes](https://mastra.ai/reference/observability/tracing/instances) - Core classes and methods
- [Span Interfaces](https://mastra.ai/reference/observability/tracing/spans) - Span types and lifecycle
- [Type Definitions](https://mastra.ai/reference/observability/tracing/interfaces) - Complete interface reference

### Exporters

- [DefaultExporter](https://mastra.ai/reference/observability/tracing/exporters/default-exporter) - Storage persistence
- [CloudExporter](https://mastra.ai/reference/observability/tracing/exporters/cloud-exporter) - Mastra Cloud integration
- [ConsoleExporter](https://mastra.ai/reference/observability/tracing/exporters/console-exporter) - Debug output
- [Arize](https://mastra.ai/reference/observability/tracing/exporters/arize) - Arize Phoenix and Arize AX integration
- [Braintrust](https://mastra.ai/reference/observability/tracing/exporters/braintrust) - Braintrust integration
- [Langfuse](https://mastra.ai/reference/observability/tracing/exporters/langfuse) - Langfuse integration
- [MLflow](https://mastra.ai/docs/observability/tracing/exporters/otel) - MLflow OTLP endpoint setup
- [OpenTelemetry](https://mastra.ai/reference/observability/tracing/exporters/otel) - OTEL-compatible platforms

### Bridges

- [OpenTelemetry Bridge](https://mastra.ai/reference/observability/tracing/bridges/otel) - OTEL context integration

### Processors

- [Sensitive Data Filter](https://mastra.ai/docs/observability/tracing/processors/sensitive-data-filter) - Data redaction


# Default exporter

The `DefaultExporter` persists traces to your configured storage backend, making them accessible through Studio. It's automatically enabled when using the default observability configuration and requires no external services.

> **Production Observability:** Observability data can quickly overwhelm general-purpose databases in production. For high-traffic applications, we recommend using **ClickHouse** for the observability storage domain via [composite storage](https://mastra.ai/reference/storage/composite). See [Production Recommendations](#production-recommendations) for details.

## Configuration

### Prerequisites

1. **Storage Backend**: Configure a storage provider (libSQL, PostgreSQL, etc.)
2. **Studio**: Install for viewing traces locally

### Basic Setup

```typescript
import { Mastra } from '@mastra/core'
import { Observability, DefaultExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db', // Required for trace persistence
  }),
  observability: new Observability({
    configs: {
      local: {
        serviceName: 'my-service',
        exporters: [new DefaultExporter()],
      },
    },
  }),
})
```

### Recommended Configuration

Include DefaultExporter in your observability configuration:

```typescript
import { Mastra } from '@mastra/core'
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (requires MASTRA_CLOUD_ACCESS_TOKEN)
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
})
```

## Studio

Access your traces through Studio:

1. Start Studio
2. Navigate to Observability
3. Filter and search your local traces
4. Inspect detailed span information

## Tracing strategies

DefaultExporter automatically selects the optimal tracing strategy based on your storage provider. You can also override this selection if needed.

### Available Strategies

| Strategy               | Description                                               | Use Case                            |
| ---------------------- | --------------------------------------------------------- | ----------------------------------- |
| **realtime**           | Process each event immediately                            | Development, debugging, low traffic |
| **batch-with-updates** | Buffer events and batch write with full lifecycle support | Low volume Production               |
| **insert-only**        | Only process completed spans, ignore updates              | High volume Production              |

### Strategy Configuration

```typescript
new DefaultExporter({
  strategy: 'auto', // Default - let storage provider decide
  // or explicitly set:
  // strategy: 'realtime' | 'batch-with-updates' | 'insert-only'

  // Batching configuration (applies to both batch-with-updates and insert-only)
  maxBatchSize: 1000, // Max spans per batch
  maxBatchWaitMs: 5000, // Max wait before flushing
  maxBufferSize: 10000, // Max spans to buffer
})
```

## Storage provider support

Different storage providers support different tracing strategies. Some providers support observability for production workloads, while others are intended primarily for local development.

If you set the strategy to `'auto'`, the `DefaultExporter` automatically selects the optimal strategy for the storage provider. If you set the strategy to a mode that the storage provider doesn't support, you will get an error message.

### Providers with Observability Support

| Storage Provider                                                 | Preferred Strategy | Supported Strategies            | Recommended Use                       |
| ---------------------------------------------------------------- | ------------------ | ------------------------------- | ------------------------------------- |
| **ClickHouse** (`@mastra/clickhouse`)                            | insert-only        | insert-only                     | Production (high-volume)              |
| **[PostgreSQL](https://mastra.ai/reference/storage/postgresql)** | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[MSSQL](https://mastra.ai/reference/storage/mssql)**           | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[MongoDB](https://mastra.ai/reference/storage/mongodb)**       | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[libSQL](https://mastra.ai/reference/storage/libsql)**         | batch-with-updates | batch-with-updates, insert-only | Default storage, good for development |

### Providers without Observability Support

The following storage providers **don't support** the observability domain. If you're using one of these providers and need observability, use [composite storage](https://mastra.ai/reference/storage/composite) to route observability data to a supported provider:

- [Convex](https://mastra.ai/reference/storage/convex)
- [DynamoDB](https://mastra.ai/reference/storage/dynamodb)
- [Cloudflare D1](https://mastra.ai/reference/storage/cloudflare-d1)
- [Cloudflare Durable Objects](https://mastra.ai/reference/storage/cloudflare)
- [Upstash](https://mastra.ai/reference/storage/upstash)
- [LanceDB](https://mastra.ai/reference/storage/lance)

### Strategy Benefits

- **realtime**: Immediate visibility, best for debugging
- **batch-with-updates**: 10-100x throughput improvement, full span lifecycle
- **insert-only**: Additional 70% reduction in database operations, perfect for analytics

## Production recommendations

Observability data grows quickly in production environments. A single agent interaction can generate hundreds of spans, and high-traffic applications can produce thousands of traces per day. Most general-purpose databases aren't optimized for this write-heavy, append-only workload.

### Recommended: ClickHouse for High-Volume Production

[ClickHouse](https://mastra.ai/reference/storage/composite) is a columnar database designed for high-volume analytics workloads. It's the recommended choice for production observability because:

- **Optimized for writes**: Handles millions of inserts per second
- **Efficient compression**: Reduces storage costs for trace data
- **Fast queries**: Columnar storage enables quick trace lookups and aggregations
- **Time-series native**: Built-in support for time-based data retention and partitioning

### Using Composite Storage

If you're using a provider without observability support (like Convex or DynamoDB) or want to optimize performance, use [composite storage](https://mastra.ai/reference/storage/composite) to route observability data to ClickHouse while keeping other data in your primary database.

## Batching behavior

### Flush Triggers

For both batch strategies (`batch-with-updates` and `insert-only`), traces are flushed to storage when any of these conditions are met:

1. **Size trigger**: Buffer reaches `maxBatchSize` spans
2. **Time trigger**: `maxBatchWaitMs` elapsed since first event
3. **Emergency flush**: Buffer approaches `maxBufferSize` limit
4. **Shutdown**: Force flush all pending events

### Error handling

The DefaultExporter includes robust error handling for production use:

- **Retry Logic**: Exponential backoff (500ms, 1s, 2s, 4s)
- **Transient Failures**: Automatic retry with backoff
- **Persistent Failures**: Drop batch after 4 failed attempts
- **Buffer Overflow**: Prevent memory issues during storage outages

### Configuration Examples

```typescript
// Zero config - recommended for most users
new DefaultExporter()

// Development override
new DefaultExporter({
  strategy: 'realtime', // Immediate visibility for debugging
})

// High-throughput production
new DefaultExporter({
  maxBatchSize: 2000, // Larger batches
  maxBatchWaitMs: 10000, // Wait longer to fill batches
  maxBufferSize: 50000, // Handle longer outages
})

// Low-latency production
new DefaultExporter({
  maxBatchSize: 100, // Smaller batches
  maxBatchWaitMs: 1000, // Flush quickly
})
```

## Related

- [Tracing Overview](https://mastra.ai/docs/observability/tracing/overview)
- [CloudExporter](https://mastra.ai/docs/observability/tracing/exporters/cloud)
- [Composite Storage](https://mastra.ai/reference/storage/composite) - Combine multiple storage providers
- [Storage Configuration](https://mastra.ai/docs/memory/storage)






# Request context

Agents, tools, and workflows can all accept `RequestContext` as a parameter, making request-specific values available to the underlying primitives.

## When to use `RequestContext`

Use `RequestContext` when a primitive's behavior should change based on runtime conditions. For example, you might switch models or storage backends based on user attributes, or adjust instructions and tool selection based on language.

> **Note:** `RequestContext` is primarily used for passing data into specific requests. It's distinct from agent memory, which handles conversation history and state persistence across multiple calls.

## Setting values

Pass `requestContext` into an agent, network, workflow, or tool call to make values available to all underlying primitives during execution. Use `.set()` to define values before making the call.

The `.set()` method takes two arguments:

1. **key**: The name used to identify the value.
2. **value**: The data to associate with that key.

```typescript
import { RequestContext } from '@mastra/core/request-context'

export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

const requestContext = new RequestContext<UserTier>()
requestContext.set('user-tier', 'enterprise')

const agent = mastra.getAgent('weatherAgent')
await agent.generate("What's the weather in London?", {
  requestContext,
})

const routingAgent = mastra.getAgent('routingAgent')
routingAgent.network("What's the weather in London?", {
  requestContext,
})

const run = await mastra.getWorkflow('weatherWorkflow').createRun()
await run.start({
  inputData: {
    location: 'London',
  },
  requestContext,
})
await run.resume({
  resumeData: {
    city: 'New York',
  },
  requestContext,
})

await weatherTool.execute({ location: 'London' }, { requestContext })
```

### Setting values based on request headers

You can populate `requestContext` dynamically in server middleware by extracting information from the request. In this example, the `temperature-unit` is set based on the Cloudflare `CF-IPCountry` header to ensure responses match the user's locale.

```typescript
import { Mastra } from '@mastra/core'
import { RequestContext } from '@mastra/core/request-context'
import { testWeatherAgent } from './agents/test-weather-agent'

export const mastra = new Mastra({
  agents: { testWeatherAgent },
  server: {
    middleware: [
      async (context, next) => {
        const country = context.req.header('CF-IPCountry')
        const requestContext = context.get('requestContext')

        requestContext.set('temperature-unit', country === 'US' ? 'fahrenheit' : 'celsius')

        await next()
      },
    ],
  },
})
```

> **Info:** Visit [Middleware](https://mastra.ai/docs/server/middleware) for how to use server middleware.

## Studio

When developing locally, you can define named presets in a JSON file and load them into [Studio](https://mastra.ai/docs/studio/overview) with the [`--request-context-presets`](https://mastra.ai/reference/cli/mastra) CLI flag. This adds a dropdown to the request context editor in Studio so you can quickly switch between configurations without manually editing JSON each time.

```bash
mastra dev --request-context-presets ./presets.json
```

```json
{
  "development": { "userId": "dev-user", "env": "development" },
  "production": { "userId": "prod-user", "env": "production" }
}
```

When you select a preset from the dropdown, the JSON editor populates with that preset's values. Editing the JSON manually switches the dropdown back to **"Custom"**.

## Accessing values with agents

You can access the `requestContext` argument from any supported configuration options in agents. These functions can be sync or `async`. Use the `.get()` method to read values from `requestContext`.

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: async ({ requestContext }) => {
    const userTier = requestContext.get('user-tier') as UserTier['user-tier']

    if (userTier === 'enterprise') {
    }
  },
  model: ({ requestContext }) => {},
  tools: ({ requestContext }) => {},
  memory: ({ requestContext }) => {},
})
```

You can also use `requestContext` with other options like `agents`, `workflows`, `scorers`, `inputProcessors`, and `outputProcessors`.

### Dynamic instructions

Agent instructions can be provided as an async function, enabling you to resolve prompts dynamically at runtime. Combined with `requestContext`, this enables patterns like:

- **Personalization**: Tailor instructions based on user attributes, preferences, or tier
- **Localization**: Adjust tone, language, or behavior based on locale
- **A/B testing**: Serve different prompt variants for experimentation
- **External prompt management**: Fetch prompts from registry services without redeploying

```typescript
import { Agent } from '@mastra/core/agent'

export const dynamicAgent = new Agent({
  id: 'dynamic-agent',
  name: 'Dynamic Agent',
  instructions: async ({ requestContext }) => {
    const userTier = requestContext?.get('user-tier')
    const locale = requestContext?.get('locale')

    // Personalize based on user tier
    const basePrompt =
      userTier === 'enterprise'
        ? 'You are a premium support agent. Provide detailed, thorough responses with technical depth.'
        : 'You are a helpful assistant. Be concise and friendly.'

    // Localize behavior
    const localeInstructions = locale === 'ja' ? 'Respond in Japanese using formal keigo.' : ''

    return `${basePrompt} ${localeInstructions}`.trim()
  },
  model: 'openai/gpt-5.4',
})
```

#### Fetching from a prompt registry

If your organization uses a prompt registry service for central prompt management, you can fetch instructions at runtime. This allows you to update prompts without redeploying, run experiments with variants, and track prompt usage across your agents.

```typescript
import { Agent } from '@mastra/core/agent'

// Your prompt registry client
import { promptRegistry } from '../lib/prompt-registry'

export const registryAgent = new Agent({
  id: 'registry-agent',
  name: 'Registry Agent',
  instructions: async ({ requestContext }) => {
    const prompt = await promptRegistry.getPrompt({
      promptId: 'customer-support-agent',
      // Pass context for variant selection or tracking
      variant: requestContext?.get('experiment-variant'),
      userId: requestContext?.get('user-id'),
    })

    return prompt.content
  },
  model: 'openai/gpt-5.4',
})
```

> **Info:** Visit [Agent](https://mastra.ai/reference/agents/agent) for a full list of configuration options.

## Accessing values from workflow steps

You can access the `requestContext` argument from a workflow step's `execute` function. This function can be sync or async. Use the `.get()` method to read values from `requestContext`.

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

const stepOne = createStep({
  id: 'step-one',
  execute: async ({ requestContext }) => {
    const userTier = requestContext.get('user-tier') as UserTier['user-tier']

    if (userTier === 'enterprise') {
    }
  },
})
```

> **Info:** Visit [createStep()](https://mastra.ai/reference/workflows/step) for a full list of configuration options.

## Accessing values with tools

You can access the `requestContext` argument from a tool's `execute` function. This function is `async`. Use the `.get()` method to read values from `requestContext`.

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

export const weatherTool = createTool({
  id: 'weather-tool',
  execute: async (inputData, context) => {
    const userTier = context?.requestContext?.get('user-tier') as UserTier['user-tier'] | undefined

    if (userTier === 'enterprise') {
    }
  },
})
```

> **Info:** Visit [createTool()](https://mastra.ai/reference/tools/create-tool) for a full list of configuration options.

## Reserved keys

Mastra reserves special context keys for security purposes. When set by middleware, these keys take precedence over client-provided values. The server automatically validates ownership and returns 403 errors when users attempt to access resources they don't own.

```typescript
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'

// In middleware: force memory operations to use authenticated user's ID
requestContext.set(MASTRA_RESOURCE_ID_KEY, user.id)

// In middleware: set validated thread ID
requestContext.set(MASTRA_THREAD_ID_KEY, threadId)
```

| Key                      | Purpose                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MASTRA_RESOURCE_ID_KEY` | Forces all memory operations to use this resource ID. The server validates that accessed threads belong to this resource and returns 403 if not. |
| `MASTRA_THREAD_ID_KEY`   | Forces thread operations to use this thread ID, overriding client-provided values                                                                |

These keys are used to implement user isolation in multi-tenant applications. See [Authorization middleware](https://mastra.ai/docs/server/middleware) for usage examples.

## TypeScript support

When you provide a type parameter to `RequestContext`, all methods are fully typed:

```typescript
import { RequestContext } from '@mastra/core/request-context'

type MyContext = {
  userId: string
  maxTokens: number
  isPremium: boolean
}

const ctx = new RequestContext<MyContext>()

// set() enforces correct value types
ctx.set('userId', 'user-123') // ✓ valid
ctx.set('maxTokens', 4096) // ✓ valid
ctx.set('maxTokens', 'wrong') // ✗ TypeScript error: expected number

// get() returns the correct type automatically
const tokens = ctx.get('maxTokens') // inferred as number
const id = ctx.get('userId') // inferred as string

// keys() returns typed keys
for (const key of ctx.keys()) {
  // key is "userId" | "maxTokens" | "isPremium"
}

// entries() supports type narrowing
for (const [key, value] of ctx.entries()) {
  if (key === 'maxTokens') {
    // TypeScript knows value is number here
    console.log(value.toFixed(2))
  }
  if (key === 'userId') {
    // TypeScript knows value is string here
    console.log(value.toUpperCase())
  }
}
```

## Schema validation

Use `requestContextSchema` to define a Zod schema that validates request context values at runtime. This catches missing or invalid context values early, provides clear error messages, and gives you type inference within your component.

### Agent schema validation

When you define `requestContextSchema` on an agent, the context is validated at the start of `generate()` or `stream()`. If validation fails, the agent throws a `MastraError` before any LLM calls are made.

```typescript
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'

export const validatedAgent = new Agent({
  id: 'validated-agent',
  name: 'Validated Agent',
  requestContextSchema: z.object({
    userId: z.string(),
    apiKey: z.string(),
  }),
  instructions: ({ requestContext }) => {
    // Access all values as a typed object
    const { userId, apiKey } = requestContext.all
    // { userId: string; apiKey: string }

    // Or retrieve individual values with .get()
    const id = requestContext.get('userId')
    // string

    return `You are helping user ${userId}`
  },
  model: 'openai/gpt-5.4',
})
```

When validation fails, the error includes the agent ID and details about which fields failed:

```text
Request context validation failed for agent 'validated-agent':
- apiKey: Required
```

### Tool schema validation

When you define `requestContextSchema` on a tool, the context is validated before `execute()` runs. Unlike agents, tools return a validation error object instead of throwing:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const validatedTool = createTool({
  id: 'validated-tool',
  description: 'A tool that requires authenticated context',
  inputSchema: z.object({
    query: z.string(),
  }),
  requestContextSchema: z.object({
    userId: z.string(),
  }),
  execute: async (inputData, context) => {
    // Access all values as a typed object
    const { userId } = context.requestContext?.all ?? {}
    // { userId: string }

    // Or retrieve individual values with .get()
    const id = context.requestContext?.get('userId')
    // string | undefined

    return { result: `Processed for ${userId}` }
  },
})
```

When validation fails, the tool returns an error object instead of throwing:

```json
{
  "error": true,
  "message": "Request context validation failed for validated-tool. Please fix the following errors and try again:\n- userId: Required\n\nProvided context: {}"
}
```

### Workflow schema validation

When you define `requestContextSchema` on a workflow, the context is validated at the start of `run.start()`. If validation fails, the workflow throws an error before any steps execute.

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

// Define schema once and share between workflow and steps
const workflowContextSchema = z.object({
  tenantId: z.string(),
})

const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  // Add schema to step for type inference
  requestContextSchema: workflowContextSchema,
  execute: async ({ inputData, requestContext }) => {
    // Access all values as a typed object
    const { tenantId } = requestContext.all
    // { tenantId: string }

    // Or retrieve individual values with .get()
    const id = requestContext.get('tenantId')
    // string

    return { result: `Processed for tenant ${tenantId}` }
  },
})

export const validatedWorkflow = createWorkflow({
  id: 'validated-workflow',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  requestContextSchema: workflowContextSchema,
})
  .then(step1)
  .commit()
```

When validation fails, the workflow throws an error:

```text
Request context validation failed for workflow 'validated-workflow':
- tenantId: Required
```

Steps can also define their own `requestContextSchema` for step-level validation. Step validation runs before the step's `execute()` function.

### Validation behavior

| Component | Property               | Validation timing                  | On failure            |
| --------- | ---------------------- | ---------------------------------- | --------------------- |
| Agent     | `requestContextSchema` | Start of `generate()` / `stream()` | Throws `MastraError`  |
| Tool      | `requestContextSchema` | Before `execute()`                 | Returns error object  |
| Workflow  | `requestContextSchema` | Start of `run.start()`             | Throws `Error`        |
| Step      | `requestContextSchema` | Before step `execute()`            | Step fails with error |

### Best practices

**Match your middleware**: Define the same required fields in your schema that your middleware sets. This ensures the contract between middleware and components is explicit and validated.

```typescript
// Middleware sets these fields
requestContext.set('userId', user.id)
requestContext.set('tenantId', tenant.id)

// Schema validates they exist
requestContextSchema: z.object({
  userId: z.string(),
  tenantId: z.string(),
})
```

**Use optional fields for conditional context**: Use `.optional()` for values that may not always be present.

```typescript
requestContextSchema: z.object({
  userId: z.string(), // Always required
  experimentVariant: z.string().optional(), // May not be set
})
```

**Handle tool validation errors**: Since tools return error objects instead of throwing, check for errors in your agent or workflow logic when tool execution is critical.

## Related

- [Agent Request Context](https://mastra.ai/docs/memory/overview)
- [Workflow Request Context](https://mastra.ai/docs/workflows/overview)
- [Server Middleware](https://mastra.ai/docs/server/middleware)
- [Authorization Middleware](https://mastra.ai/docs/server/middleware)
Automatic Metadata from RequestContext
Instead of manually adding metadata to each span, you can configure Mastra to automatically extract values from RequestContext and attach them as metadata to all spans in a trace. This is useful for consistently tracking user identifiers, environment information, feature flags, or any request-scoped data across your entire trace.

Configuration-Level Extraction
Define which RequestContext keys to extract in your tracing configuration. These keys will be automatically included as metadata for all spans created with this configuration:

src/mastra/index.ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        requestContextKeys: ['userId', 'environment', 'tenantId'],
        exporters: [new DefaultExporter()],
      },
    },
  }),
})

Now when you execute agents or workflows with a RequestContext, these values are automatically extracted:

const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('tenantId', 'tenant-456')

// All spans in this trace automatically get userId, environment, and tenantId metadata
const result = await agent.generate('Hello', {
  requestContext,
})

Per-Request Additions
You can add trace-specific keys using tracingOptions.requestContextKeys. These are merged with the configuration-level keys:

const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('experimentId', 'exp-789')

const result = await agent.generate('Hello', {
  requestContext,
  tracingOptions: {
    requestContextKeys: ['experimentId'], // Adds to configured keys
  },
})

// All spans now have: userId, environment, AND experimentId

Nested Value Extraction
Use dot notation to extract nested values from RequestContext:

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        requestContextKeys: ['user.id', 'session.data.experimentId'],
        exporters: [new DefaultExporter()],
      },
    },
  }),
})

const requestContext = new RequestContext()
requestContext.set('user', { id: 'user-456', name: 'John Doe' })
requestContext.set('session', { data: { experimentId: 'exp-999' } })

// Metadata will include: { user: { id: 'user-456' }, session: { data: { experimentId: 'exp-999' } } }

How it works
TraceState Computation: At the start of a trace (root span creation), Mastra computes which keys to extract by merging configuration-level and per-request keys
Automatic Extraction: Root spans (agent runs, workflow executions) automatically extract metadata from RequestContext
Child Span Extraction: Child spans can also extract metadata if you pass requestContext when creating them
Metadata Precedence: Explicit metadata passed to span options always takes precedence over extracted metadata
Adding Tags to Traces
Tags are string labels that help you categorize and filter traces. Unlike metadata (which contains structured key-value data), tags are plain strings designed for quick filtering and organization.

Use tracingOptions.tags to add tags when executing agents or workflows:

// With agents
const result = await agent.generate('Hello', {
  tracingOptions: {
    tags: ['production', 'experiment-v2', 'user-request'],
  },
})

// With workflows
const run = await mastra.getWorkflow('myWorkflow').createRun()
const result = await run.start({
  inputData: { data: 'process this' },
  tracingOptions: {
    tags: ['batch-processing', 'priority-high'],
  },
})

How Tags Work
Root span only: Tags are applied only to the root span of a trace (the agent run or workflow run span)
Widely supported: Tags are supported by most exporters for filtering and searching traces:
Braintrust - Native tags field
Langfuse - Native tags field on traces
ArizeExporter - tag.tags OpenInference attribute
OtelExporter - mastra.tags span attribute
OtelBridge - mastra.tags span attribute
Combinable with metadata: You can use both tags and metadata in the same tracingOptions
const result = await agent.generate([{ role: 'user', content: 'Analyze this' }], {
  tracingOptions: {
    tags: ['production', 'analytics'],
    metadata: { userId: 'user-123', experimentId: 'exp-456' },
  },
})

Common Tag Patterns
Environment: "production", "staging", "development"
Feature flags: "feature-x-enabled", "beta-user"
Request types: "user-request", "batch-job", "scheduled-task"
Priority levels: "priority-high", "priority-low"
Experiments: "experiment-v1", "control-group", "treatment-a"



The problem is that the requestContext object is created at module level but never passed to agent.generate(). It just sits unused. requestContextKeys only extracts values when a RequestContext is actually provided at the call site.

For workflows, you're likely already passing requestContext to run.start(). For direct agent calls, it's missing.

Let me check where the agent is called:

The root cause is two-fold:

The module-level requestContext with TestID is never passed to agent.stream() or any call — it just sits unused
The workflow step's execute signature uses a second context?:any parameter instead of destructuring requestContext from the first argument, and still doesn't pass it to agent.stream()
The fix: generate TestID per-request in middleware (so it works for all requests), fix the step signature, and pass requestContext to agent.stream().

Now I have the full picture. Here are the two fixes:

index.ts: Move TestID generation into server middleware so every request gets a unique ID in its RequestContext
weather-workflow.ts: Fix the planActivities execute signature to receive requestContext and pass it to agent.stream()
Now pass requestContext to agent.stream() in the workflow step:

Edited
weather-workflow.ts+1-0
Here's what changed and why:

index.ts — Removed the static module-level requestContext/TestID (they were never connected to any request). Replaced with server middleware that runs on every incoming request and:

Generates a fresh TestID = crypto.randomUUID() per request
Sets all values on the RequestContext Mastra automatically provides per-request
This means every agent call, tool call, and workflow step triggered via the Mastra server automatically gets a unique TestID in its RequestContext, which requestContextKeys then extracts as metadata on all spans.

weather-workflow.ts — Fixed the planActivities execute signature from (args, context?:any) → ({ inputData, mastra, requestContext }), and passed requestContext to agent.stream() so the trace context flows through correctly.

Perfect :) please create a document called Trace ID. and keep it in docs folder.

Any person in my team want to integrate this in mastra or into their agent he should understand what to do clearly

Created docs/Trace-ID.md. It covers:
