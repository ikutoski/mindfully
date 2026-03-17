import { z } from 'zod';
import { tool, createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { randomBytes } from 'node:crypto';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createLogger } from 'core';

const logger = createLogger('agent:spawn');

const SpawnAgentSchema = z.object({
  prompt: z.string().describe('The task to give the child agent.'),
  context: z.string().optional().describe(
    'Optional context passed as a system message before the prompt. ' +
    'Use this to share relevant background without exposing the full conversation history.',
  ),
  tools: z.array(z.string()).optional().describe(
    'Names of builtin tools to give the child agent. ' +
    'Omit or pass an empty array to give the child all available tools.',
  ),
});

export type SpawnAgentInput = z.infer<typeof SpawnAgentSchema>;

/**
 * Creates the `spawn_agent` tool.
 *
 * @param model     The same model instance used by the parent agent.
 * @param allTools  The base builtin tools (must NOT include spawn_agent itself —
 *                  this prevents structural depth-1 recursion).
 */
export function createSpawnAgentTool(
  model: BaseChatModel,
  allTools: StructuredToolInterface[],
) {
  return tool(
    async (args: SpawnAgentInput) => {
      // ── 1. Validate requested tool names ──────────────────────────────────
      const requestedNames = args.tools ?? [];
      const unknown = requestedNames.filter(
        (n) => !allTools.some((t) => t.name === n),
      );
      if (unknown.length > 0) {
        return `Unknown tools: ${unknown.join(', ')}`;
      }

      const childTools =
        requestedNames.length === 0
          ? allTools
          : allTools.filter((t) => requestedNames.includes(t.name));

      logger.debug('spawning child agent', {
        toolCount: childTools.length,
        tools: childTools.map((t) => t.name),
        hasContext: !!args.context,
      });

      // ── 2. Ephemeral in-memory checkpointer ───────────────────────────────
      const checkpointer = new MemorySaver();
      const threadId = randomBytes(4).toString('hex');

      // ── 3. Build child graph ───────────────────────────────────────────────
      const graph = createAgent({ model, tools: childTools, checkpointer });

      // ── 4. Build input messages ────────────────────────────────────────────
      const inputMessages = [
        ...(args.context ? [new SystemMessage(args.context)] : []),
        new HumanMessage(args.prompt),
      ];

      // ── 5. Invoke child graph (blocking) ──────────────────────────────────
      try {
        const result = await graph.invoke(
          { messages: inputMessages },
          // callbacks: [] prevents LangChain from inheriting the parent
          // agent's AsyncLocalStorage stream context into the child.
          // Without this, the child's internal LLM/tool events leak into
          // the parent's stream, corrupting the parent's tool call display
          // and potentially causing the parent stream to terminate early.
          { configurable: { thread_id: threadId }, callbacks: [] },
        );

        // ── 6. Extract last AIMessage text ────────────────────────────────
        const messages: unknown[] = (result as { messages?: unknown[] })?.messages ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!(msg instanceof AIMessage)) continue;

          const content = msg.content;
          if (typeof content === 'string' && content.trim().length > 0) {
            logger.debug('child agent complete', { responseLength: content.length });
            return content;
          }
          if (Array.isArray(content)) {
            const text = content
              .filter(
                (b): b is { type: string; text: string } =>
                  typeof b === 'object' &&
                  b !== null &&
                  (b as Record<string, unknown>)['type'] === 'text' &&
                  typeof (b as Record<string, unknown>)['text'] === 'string',
              )
              .map((b) => b.text)
              .join('');
            if (text.trim().length > 0) {
              logger.debug('child agent complete', { responseLength: text.length });
              return text;
            }
          }
        }

        logger.debug('child agent returned no text response');
        return '(no response)';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('child agent failed', { error: message });
        return `Child agent failed: ${message}`;
      }
    },
    {
      name: 'spawn_agent',
      description:
        'Spawn a child agent to handle a focused subtask. The child runs in isolation ' +
        'with its own context window and returns its final response as a string. ' +
        'Use this to delegate complex subtasks without polluting the current conversation. ' +
        'Optionally pass context to share relevant background with the child, and restrict ' +
        'the tools the child can use via the tools parameter.',
      schema: SpawnAgentSchema,
    },
  );
}
