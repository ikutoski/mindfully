/**
 * CLI graph factory.
 *
 * Creates a LangGraph ReactAgent pre-configured for CLI use:
 * - Accepts a SqliteSaver checkpointer for session persistence
 * - The caller is responsible for creating the checkpointer via `createCheckpointer()`
 */

import { createAgent } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

export interface CreateCliGraphParams {
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  checkpointer: BaseCheckpointSaver;
}

/**
 * Create a ReactAgent graph for CLI use with a persistent checkpointer.
 *
 * @param params.model        - The chat model instance (no bound tools).
 * @param params.tools        - The tools to give the agent.
 * @param params.checkpointer - A SqliteSaver (or any BaseCheckpointSaver) for session persistence.
 * @returns A compiled ReactAgent graph.
 */
export function createCliGraph(params: CreateCliGraphParams): ReturnType<typeof createAgent> {
  const { model, tools, checkpointer } = params;
  return createAgent({ model, tools, checkpointer });
}
