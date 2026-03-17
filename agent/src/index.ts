import { ChatOpenAI } from '@langchain/openai';
import { createLogger } from 'core';

export * from './tools/index.js';
export * from './tools/builtin/index.js';

const logger = createLogger('agent');

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Returns a plain, unbound ChatOpenAI instance.
 *
 * Tools must NOT be bound here — ReactAgent (createAgent) calls
 * validateLLMHasNoBoundTools() and will throw MultipleToolsBoundError if
 * the model already has tools attached.  Pass tools separately to createAgent.
 */
export function getModelInstance(opts: { streaming?: boolean } = { streaming: true }): ChatOpenAI {
  const providerOpts = {
    model: process.env['LLM_MODEL'] ?? 'deepseek-chat',
    apiKey: process.env['LLM_API_KEY'] ?? '',
    temperature: parseFloat(process.env['LLM_TEMPERATURE'] ?? '0.7'),
    configuration: {
      baseURL: process.env['LLM_BASE_URL'] ?? 'https://opencode.ai/zen/v1',
    },
    maxTokens: parseInt(process.env['LLM_MAX_TOKENS'] ?? '4096', 10),
    ...opts,
  };
  logger.debug('Creating OpenAI model instance with config', providerOpts);
  return new ChatOpenAI(providerOpts);
}
