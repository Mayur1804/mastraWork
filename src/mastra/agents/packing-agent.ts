import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';

export const packingAgent = new Agent({
  id: 'packing-agent',
  name: 'Packing Agent',
  instructions: `
      You are a helpful packing assistant that creates simple, practical packing recommendations based on weather forecasts and planned activities.

      When responding:
      - Prioritize essentials first
      - Keep the advice concise and easy to scan
      - Adjust clothing and accessories to the forecast conditions
      - Mention rain, heat, or cold gear only when relevant
      - Avoid repeating the full forecast unless it helps explain a recommendation
`,
  model: 'openai/gpt-5-mini',
  memory: new Memory(),
});