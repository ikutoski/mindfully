import { z } from 'zod';
import { tool } from 'langchain';
import { createAgent } from 'langchain';
import { HumanMessage, SystemMessage, AIMessage, AIMessageChunk, isAIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
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
  maxIterations: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe(
      'Maximum number of model→tools cycles before stopping (default: 20). ' +
      'Each iteration counts as one model call plus its resulting tool calls.',
    ),
});

export type SpawnAgentInput = z.infer<typeof SpawnAgentSchema>;

/**
 * Creates the `spawn_agent` tool.
 *
 * The child agent runs as a LangGraph ReAct loop (createReactAgent) with:
 *  - No checkpointer (ephemeral, stateless — no thread_id needed)
 *  - No stream mode (.invoke only)
 *  - Parent workspaceDir forwarded via configurable so filesystem tools work
 *
 * @param model     The same model instance used by the parent agent.
 * @param allTools  The base builtin tools (must NOT include spawn_agent itself —
 *                  this prevents infinite recursion).
 */
export function createSpawnAgentTool(
  model: BaseChatModel,
  allTools: StructuredToolInterface[],
) {
  return tool(
    async (args: SpawnAgentInput, config?: RunnableConfig) => {
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

      const maxIterations = args.maxIterations ?? 20;

      logger.debug('spawning child agent', {
        toolCount: childTools.length,
        tools: childTools.map((t) => t.name),
        hasContext: !!args.context,
        maxIterations,
      });

      // ── 2. Build child graph ───────────────────────────────────────────────
      // No checkpointer → fully ephemeral; no persistence, no thread_id needed.
      const graph = createAgent({
        model,
        tools: childTools,
        checkpointer: false,
      });

      // ── 3. Build input messages ────────────────────────────────────────────
      const inputMessages = [
        ...(args.context ? [new SystemMessage(args.context)] : []),
        new HumanMessage(args.prompt),
      ];

      // ── 4. Invoke child graph (blocking, no stream) ────────────────────────
      try {
        const result = await graph.invoke(
          { messages: inputMessages },
          {
            // Forward only workspaceDir from the parent's configurable so
            // filesystem tools (read, write, edit, bash, glob …) resolve paths
            // relative to the same root as the parent agent.
            configurable: {
              workspaceDir: config?.configurable?.['workspaceDir'],
            },
            // callbacks: [] prevents LangChain from inheriting the parent
            // agent's AsyncLocalStorage stream context into the child.
            // Without this, child LLM/tool events leak into the parent stream,
            // corrupting the parent's tool call display and potentially
            // causing the parent stream to terminate early.
            callbacks: [],
            // Each iteration = agent node + tools node = 2 LangGraph steps.
            recursionLimit: maxIterations * 2,
          },
        );
        // ── 5. Extract last AIMessage text ─────────────────────────────────
        const aiMessage = (result.messages ?? []).filter((m) => AIMessage.isInstance(m)).reverse()[0];
        if (aiMessage?.text) {
          logger.debug('child agent returned response', { response: aiMessage.text });
          return aiMessage.text;
        } else {
          logger.debug('child agent returned no text response');
          return '(no response)';
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('child agent failed', { error: message });
        return `Child agent failed: ${message}`;
      }
    },
    {
      name: 'spawn_agent',
      description:
        'Spawn a child agent to handle a focused subtask. The child runs as an ' +
        'isolated ReAct loop with its own context window and returns its final ' +
        'response as a string. Use this to delegate complex subtasks without ' +
        'polluting the current conversation. Optionally pass context to share ' +
        'relevant background with the child, restrict the tools it can use via ' +
        'the tools parameter, and cap its runtime with maxIterations.',
      schema: SpawnAgentSchema,
    },
  );
}
