/**
 * Token compaction for long-running CLI sessions.
 *
 * When the running message history grows too large (by token estimate or count),
 * the middle of the conversation is summarised by the model and replaced with
 * a Human+AI summary pair, keeping the SystemMessage at index 0 and the most
 * recent exchanges intact.
 *
 * Compaction is performed by reading graph state via graph.graph.getState() and
 * writing the replacement back via graph.graph.updateState(), so the
 * FileCheckpointSaver (or any other checkpointer) persists the compacted state
 * automatically.
 */

import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from 'core';

const logger = createLogger('cli:compactor');

// ─── Public interface ─────────────────────────────────────────────────────────

export interface CompactionOptions {
  /** Compact when estimated token count exceeds this value (default: 50_000) */
  tokenThreshold?: number;
  /** Compact when message count exceeds this value (default: 20) */
  messageThreshold?: number;
  /** Number of recent messages to preserve verbatim after compaction (default: 6) */
  keepRecent?: number;
}

export interface CompactionResult {
  compacted: boolean;
  removedCount: number;
}

// Minimal interface covering the parts of ReactAgent we need — avoids importing
// the full generic ReactAgent type which has very deep type params.
interface AgentWithGraph {
  graph: {
    getState(config: RunnableConfig): Promise<{ values: Record<string, unknown> }>;
    updateState(
      config: RunnableConfig,
      values: Record<string, unknown>,
      asNode?: string,
    ): Promise<RunnableConfig>;
  };
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/** Rough token estimate: sum of content lengths divided by 4 (chars per token). */
export function estimateTokens(messages: BaseMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = msg.content;
    if (typeof content === 'string') {
      total += content.length;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          total += String((block as { text: unknown }).text).length;
        }
      }
    }
  }
  return Math.ceil(total / 4);
}

// ─── Core compaction ──────────────────────────────────────────────────────────

/**
 * Check whether compaction is needed and, if so, summarise the middle of the
 * conversation and write the replacement back into the graph state.
 *
 * Does nothing (returns `{ compacted: false }`) when:
 *   - The graph has no checkpointer (no persistence configured)
 *   - The message history is within both thresholds
 *   - The history is too short to have a compactable middle (≤ keepRecent + 1)
 */
export async function maybeCompact(
  agent: AgentWithGraph,
  config: RunnableConfig,
  model: BaseChatModel,
  opts: CompactionOptions = {},
): Promise<CompactionResult> {
  const {
    tokenThreshold = 50_000,
    messageThreshold = 20,
    keepRecent = 6,
  } = opts;

  // Read current state from the checkpointer
  let messages: BaseMessage[];
  try {
    const state = await agent.graph.getState(config);
    messages = (state.values['messages'] as BaseMessage[] | undefined) ?? [];
  } catch {
    // No checkpoint yet (first turn) — nothing to compact
    return { compacted: false, removedCount: 0 };
  }

  if (messages.length === 0) return { compacted: false, removedCount: 0 };

  const tokens = estimateTokens(messages);
  const needsCompaction = tokens > tokenThreshold || messages.length > messageThreshold;

  if (!needsCompaction) {
    logger.debug('compaction not needed', { tokens, messageCount: messages.length });
    return { compacted: false, removedCount: 0 };
  }

  // Identify the compactable window:
  //   [0]             — SystemMessage (always kept)
  //   [1 .. end-keepRecent-1] — compactable middle
  //   [end-keepRecent .. end] — recent context (always kept verbatim)
  const systemMsg = messages[0] instanceof SystemMessage ? messages[0] : null;
  const windowStart = systemMsg ? 1 : 0;
  let windowEnd = messages.length - keepRecent;

  if (windowEnd <= windowStart) {
    // Not enough messages to have a compactable middle
    logger.debug('compaction skipped — window too small', { messageCount: messages.length });
    return { compacted: false, removedCount: 0 };
  }

  // Snap windowEnd back to a clean HumanMessage boundary so the tail slice
  // never starts with an orphaned tool message (which APIs like DeepSeek reject
  // as "an assistant message with tool_calls must be followed by tool messages").
  while (windowEnd > windowStart && !(messages[windowEnd] instanceof HumanMessage)) {
    windowEnd--;
  }
  if (windowEnd <= windowStart) {
    logger.debug('compaction skipped — no safe HumanMessage boundary found', { messageCount: messages.length });
    return { compacted: false, removedCount: 0 };
  }

  const toCompact = messages.slice(windowStart, windowEnd);
  const toKeep = messages.slice(windowEnd);
  const removedCount = toCompact.length;

  logger.debug('compacting', { tokens, messageCount: messages.length, removedCount });

  // Ask the model to summarise the compactable window
  const summaryResponse = await model.invoke([
    ...toCompact,
    new HumanMessage(
      'Please provide a concise summary of the conversation above. ' +
      'Capture all important context, decisions, tool calls and their outcomes, ' +
      'and any ongoing tasks. Be factual and thorough.',
    ),
  ]);

  // Build the replacement message list
  const replacement: BaseMessage[] = [
    ...(systemMsg ? [systemMsg] : []),
    new HumanMessage('Previous conversation summary:'),
    summaryResponse,
    ...toKeep,
  ];

  // Write the replacement back into the graph state
  await agent.graph.updateState(config, { messages: replacement }, 'model_request');

  logger.debug('compaction complete', {
    removedCount,
    newMessageCount: replacement.length,
  });

  return { compacted: true, removedCount };
}
