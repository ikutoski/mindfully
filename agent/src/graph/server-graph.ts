/**
 * Server graph factory.
 *
 * Creates a LangGraph ReactAgent pre-configured for server (API) use:
 * - No checkpointer (ephemeral/stateless — conversation history managed by DB)
 * - Safe to use in concurrent request handlers
 */

import { createAgent } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

export interface CreateServerGraphParams {
  model: BaseChatModel;
  tools: StructuredToolInterface[];
}

/**
 * Create an ephemeral ReactAgent graph for server use (no checkpointer).
 *
 * @param params.model  - The chat model instance (no bound tools).
 * @param params.tools  - The tools to give the agent.
 * @returns A compiled ReactAgent graph.
 */
export function createServerGraph(params: CreateServerGraphParams): ReturnType<typeof createAgent> {
  const { model, tools } = params;
  return createAgent({ model, tools, checkpointer: false });
}
