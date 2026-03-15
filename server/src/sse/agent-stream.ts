import express from 'express';
import type { Request, Response, Router } from 'express';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'agent';
import { verifyIdToken } from '../auth/utils/id-token.js';
import { agentsRepository } from '../db/repositories/agents.js';
import {
  agentSessionsRepository,
  sessionMessagesRepository,
} from '../db/repositories/agent-sessions.js';
import { executionsRepository } from '../db/repositories/executions.js';
import { getBuiltinTools } from '../tools/index.js';
import { logger } from '../logger.js';

const router: Router = express.Router();

// ─── Module-level agent singleton ─────────────────────────────────────────────

const _tools = getBuiltinTools();
const _agentGraph = createAgent(_tools);

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Title generation (async, fire-and-forget) ────────────────────────────────

async function generateTitle(
  sessionId: string,
  firstUserMessage: string,
): Promise<void> {
  let model: ChatOpenAI | undefined;
  try {
    if (process.env['OPENCODE_ZEN_API_KEY']) {
      model = new ChatOpenAI({
        model: 'glm-5',
        apiKey: process.env['OPENCODE_ZEN_API_KEY'],
        configuration: { baseURL: process.env['LLM_BASE_URL'] ?? 'https://opencode.ai/zen/v1' },
        maxTokens: 200,
        temperature: 0.5,
        streaming: false,
      });
    } else if (process.env['OPENAI_API_KEY']) {
      model = new ChatOpenAI({
        model: 'gpt-4o-mini',
        apiKey: process.env['OPENAI_API_KEY'],
        maxTokens: 20,
        temperature: 0.5,
      });
    }
  } catch {
    // fall through
  }

  if (!model) {
    await agentSessionsRepository.update(sessionId, { title: firstUserMessage.slice(0, 50) });
    return;
  }

  try {
    const response = await model.invoke([
      { role: 'system', content: 'Generate a short, descriptive title (max 6 words) for this conversation based on the first user message. Reply with only the title — no quotes, no punctuation.' },
      { role: 'user', content: firstUserMessage },
    ] as Parameters<typeof model.invoke>[0]);
    const title = String(response.content).trim() || firstUserMessage.slice(0, 50);
    await agentSessionsRepository.update(sessionId, { title });
  } catch (err) {
    logger.warn('Failed to generate session title', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    await agentSessionsRepository.update(sessionId, {
      title: firstUserMessage.slice(0, 50),
    });
  }
}

// ─── POST /agent/:agentId/run ─────────────────────────────────────────────────

router.post('/agent/:agentId/run', async (req: Request, res: Response) => {
  // --- Auth ---
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const payload = verifyIdToken(token);
  if (!payload?.sub) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const userId = payload.sub;

  // --- Validate agent ---
  const agentId = String(req.params['agentId']);
  const agent = await agentsRepository.findById(agentId);
  if (!agent || agent.user_id !== userId) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  const { sessionId: inputSessionId, message } = req.body as {
    sessionId?: string;
    message: string;
  };

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // --- SSE headers ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // --- Load or create session ---
    let session = inputSessionId
      ? await agentSessionsRepository.findById(inputSessionId)
      : null;

    if (!session) {
      session = await agentSessionsRepository.create({
        agent_id: agentId,
        user_id: userId,
      });
    }

    const sessionId = session.id;
    const isFirstMessage = (await sessionMessagesRepository.count(sessionId)) === 0;

    // --- Persist user message ---
    const userSeq = await sessionMessagesRepository.nextSequenceNumber(sessionId);
    await sessionMessagesRepository.create({
      session_id: sessionId,
      sequence_number: userSeq,
      role: 'user',
      content: message,
    });

    // --- Async title generation on first message ---
    if (isFirstMessage && !session.title) {
      generateTitle(sessionId, message).catch(() => {
        // swallow — title is cosmetic
      });
    }

    // --- Build tools and agent ---
    const workspaceDir = process.cwd();

    // --- Build conversation history from DB ---
    const allStoredMessages = (await sessionMessagesRepository.findBySessionId(sessionId, 1000)).items;

    // Build message list from stored history (excluding the current user message
    // which we just persisted — it will be appended below)
    const systemPrompt = agent.system_prompt;
    const inputMessages: BaseMessage[] = [];
    if (systemPrompt) {
      inputMessages.push(new SystemMessage(systemPrompt));
    }
    for (const m of allStoredMessages) {
      if (m.role === 'user') {
        inputMessages.push(new HumanMessage(m.content));
      } else if (m.role === 'assistant') {
        inputMessages.push(new AIMessage(m.content));
      }
      // tool messages are skipped — they are part of the assistant turn context
    }
    // Append current user message
    inputMessages.push(new HumanMessage(message));

    // --- Create execution record ---
    const execution = await executionsRepository.create({
      agent_id: agentId,
      input: message,
    });
    await executionsRepository.update(execution.id, { status: 'running' });

    // --- Inline stream loop ---
    const newMessages: Array<{
      role: 'assistant' | 'tool';
      content: string;
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
      toolCallId?: string;
      toolName?: string;
    }> = [];

    // Collect final message state
    let finalMessages: BaseMessage[] = [];

    try {
      for await (const [mode, chunk] of await _agentGraph.stream(
        { messages: inputMessages },
        {
          streamMode: ['messages', 'tools', 'values'] as const,
          recursionLimit: 100,
          configurable: { workspaceDir },
        },
      )) {
        if (mode === 'messages') {
          const [msgChunk] = chunk as [object, Record<string, unknown>];
          // Duck-type check: accept any AI message regardless of which module copy created it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msgType = typeof (msgChunk as any)._getType === 'function' ? (msgChunk as any)._getType() : null;
          if (msgType !== 'ai') continue; // skip ToolMessages etc.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content = (msgChunk as any).content;
          let text = '';
          if (typeof content === 'string') {
            text = content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === 'object' && block !== null &&
                'type' in block && (block as { type: string }).type === 'text' &&
                'text' in block && typeof (block as { text: string }).text === 'string'
              ) {
                text += (block as { text: string }).text;
              }
            }
          }
          if (text.length > 0) {
            sendEvent(res, 'chunk', { content: text });
          }
        }

        if (mode === 'tools') {
          const toolEvent = chunk as {
            event: string;
            toolCallId?: string;
            name: string;
            input?: unknown;
            output?: unknown;
            error?: unknown;
          };

          if (toolEvent.event === 'on_tool_start') {
            let inputArgs: Record<string, unknown> = {};
            if (typeof toolEvent.input === 'string') {
              try { inputArgs = JSON.parse(toolEvent.input) as Record<string, unknown>; } catch { inputArgs = { raw: toolEvent.input }; }
            } else if (toolEvent.input && typeof toolEvent.input === 'object') {
              inputArgs = toolEvent.input as Record<string, unknown>;
            }
            sendEvent(res, 'tool', {
              phase: 'start',
              name: toolEvent.name,
              args: inputArgs,
              id: toolEvent.toolCallId,
            });
          } else if (toolEvent.event === 'on_tool_end') {
            const resultContent = String(toolEvent.output);
            sendEvent(res, 'tool', {
              phase: 'result',
              name: toolEvent.name,
              result: resultContent,
              error: null,
              id: toolEvent.toolCallId,
            });
            newMessages.push({
              role: 'tool',
              content: resultContent,
              toolCallId: toolEvent.toolCallId,
              toolName: toolEvent.name,
            });
          } else if (toolEvent.event === 'on_tool_error') {
            sendEvent(res, 'tool', {
              phase: 'result',
              name: toolEvent.name,
              result: null,
              error: String(toolEvent.error),
              id: toolEvent.toolCallId,
            });
          }
        }

        if (mode === 'values') {
          const values = chunk as { messages?: BaseMessage[] };
          if (values.messages && values.messages.length > 0) {
            finalMessages = values.messages;
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Agent stream failed';
      logger.error('SSE agent stream error during stream', { agentId, sessionId, error: errMsg });
      sendEvent(res, 'error', { message: errMsg });
      await executionsRepository.update(execution.id, {
        status: 'failed',
        error: errMsg,
        completed_at: new Date(),
      });
      res.end();
      return;
    }

    // --- Collect new assistant messages from final state ---
    const inputLen = inputMessages.length;
    const freshMessages = finalMessages.slice(inputLen);
    for (const msg of freshMessages) {
      // Duck-type: check for AI message type regardless of module copy
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgType = typeof (msg as any)._getType === 'function' ? (msg as any)._getType() : null;
      if (msgType === 'ai') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiMsg = msg as any;
        newMessages.push({
          role: 'assistant',
          content: typeof aiMsg.content === 'string' ? aiMsg.content : JSON.stringify(aiMsg.content),
          ...(aiMsg.tool_calls && (aiMsg.tool_calls as unknown[]).length > 0
            ? {
                tool_calls: (aiMsg.tool_calls as Array<{ name: string; args: unknown; id?: string }>).map((tc) => ({
                  name: tc.name,
                  args: tc.args as Record<string, unknown>,
                  id: tc.id,
                })),
              }
            : {}),
        });
      }
    }

    sendEvent(res, 'done', { sessionId });

    // --- Persist new assistant/tool messages ---
    let seq = userSeq + 1;
    const messagesToPersist = newMessages.map((m) => ({
      session_id: sessionId,
      sequence_number: seq++,
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.toolCallId,
      tool_name: m.toolName,
    }));
    await sessionMessagesRepository.createBatch(messagesToPersist);

    // --- Update execution record ---
    await executionsRepository.update(execution.id, {
      status: 'completed',
      completed_at: new Date(),
    });

    // Update session_id on execution
    await executionsRepository.linkSession(execution.id, sessionId);

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('SSE agent stream error', { agentId, error: message });
    try {
      sendEvent(res, 'error', { message });
    } catch {
      // response may already be flushed
    }
    res.end();
  }
});

export default router;
