import { ChatOpenAI } from "@langchain/openai";
import { StructuredToolInterface } from "core";
import { BaseMessage, createAgent } from "langchain";
import { createLogger } from "core";
import { time } from "console";
const logger = createLogger('agent');
// ─── Stream event types ────────────────────────────────────────────────────────

type ToolsEvent = {
  event: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  toolCallId?: string;
};

type AgentStreamChunk =
  | ['messages', [BaseMessage, Record<string, unknown>]]
  | ['tools', ToolsEvent]
  | ['values', { messages: BaseMessage[] }];

interface StreamInput {
  messages: BaseMessage[];
}

interface StreamOptions {
  streamMode?: string[];
  recursionLimit?: number;
  configurable?: Record<string, unknown>;
}

// ─── MindfulAgent ─────────────────────────────────────────────────────────────



// ─── Public factory ───────────────────────────────────────────────────────────

export function getModelInstance(tools: StructuredToolInterface[]) {
  const maxTokens = parseInt(process.env['LLM_MAX_TOKENS'] ?? '4096', 10);
  return new ChatOpenAI({
    model: process.env['LLM_MODEL'] ?? 'https://api.deepseek.com',
    apiKey: process.env['API_KEY'] ?? '',
    configuration: {
      baseURL: process.env['LLM_BASE_URL'] ?? 'https://opencode.ai/zen/v1',
      timeout: 5000,
      logLevel: 'warn',
    },
    streaming: true,
    maxTokens,
  }).bindTools(tools);
}
