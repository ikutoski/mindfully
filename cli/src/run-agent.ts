#!/usr/bin/env node
/**
 * Mindful CLI — agent runner.
 *
 * Usage:
 *   pnpm --filter cli run-agent "Your prompt here"
 *   pnpm --filter cli run-agent -i "Your prompt"         # interactive REPL
 *   pnpm --filter cli run-agent -s myproject "prompt"    # named session
 *
 * Env vars are loaded from ../.env via --env-file flag in the npm script.
 *
 * Session and thread are the same concept. Pass -s <name> to use a fixed name
 * (and resume the same checkpoint DB). Omit -s for a fresh random 8-char hex ID.
 * The ID is printed at start and end. DB: ~/.mindful/sessions/<id>.db
 * Token compaction fires automatically when context grows too large.
 */

import * as readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  type BaseMessage,
  ToolMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Command } from 'commander';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { createAgent, Tool } from 'langchain';
import { getModelInstance, createBuiltinTools } from 'agent';
import { createLogger } from 'core';
import {
  print,
  println,
  renderHeader,
  renderMarkdown,
  renderError,
  renderCompacted,
  renderSessionExit,
  ConcurrentToolRenderer,
} from './render.js';
import { maybeCompact, estimateTokens } from './compactor.js';
import { get } from 'node:http';

const logger = createLogger('cli');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModelName(): string {
  return process.env['LLM_MODEL'] ?? 'unknown';
}

/** Directory where per-session SQLite databases are stored. */
function defaultSessionsDir(): string {
  return join(homedir(), '.mindful', 'sessions');
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const block of content as unknown[]) {
    if (
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      (block as { type: string }).type === 'text' &&
      'text' in block &&
      typeof (block as { text: string }).text === 'string'
    ) {
      text += (block as { text: string }).text;
    }
  }
  return text;
}

/** Count terminal rows a string occupies given a column width. */
function countRows(text: string, termCols: number): number {
  if (termCols <= 0) return text.split('\n').length;
  let rows = 0;
  for (const line of text.split('\n')) {
    rows += Math.max(1, Math.ceil(line.length / termCols));
  }
  return rows;
}

/** Erase streamed raw text and reprint as rendered Markdown (TTY only). */
function replaceStreamedLines(streamed: string, rendered: string): void {
  if (!process.stdout.isTTY) return;
  const rows = countRows(streamed, process.stdout.columns || 80);
  process.stdout.write(`\x1b[${rows}A\x1b[J`);
  process.stdout.write(rendered);
}

// ─── Stdin helpers ────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => {
      rl.question('Enter your prompt: ', (answer) => {
        rl.close();
        res(answer.trim());
      });
    });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function readInteractiveLine(prefix: string): Promise<string | null> {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prefix, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      res(trimmed.length > 0 ? trimmed : null);
    });
    rl.on('SIGINT', () => { rl.close(); res(null); });
  });
}

// ─── Core exchange ────────────────────────────────────────────────────────────

export interface RunExchangeOpts {
  prompt: string;
  messages: BaseMessage[];
  graph: ReturnType<typeof createAgent>;
  cwd: string;
  config?: RunnableConfig;
}

/**
 * Run one prompt→response exchange.
 *
 * When a config with thread_id is provided, the graph's checkpointer handles
 * session persistence automatically. Messages passed in are prepended before
 * the new HumanMessage — on resumed sessions pass an empty array.
 *
 * Streaming:
 *   - `messages` mode: stream AI tokens directly; tool call chunks trigger
 *     addTool on the renderer.
 *   - `updates.tools` fires → completeTool for each result.
 *   - `values` mode: captures the complete final state.
 */
export async function runExchange(opts: RunExchangeOpts): Promise<BaseMessage[]> {
  const { prompt, messages, graph, cwd, config } = opts;

  const inputMessages: BaseMessage[] = [...messages, new HumanMessage(prompt)];
  const toolRenderer = new ConcurrentToolRenderer();

  let finalMessages: BaseMessage[] = inputMessages;
  let responseText = '';

  const streamConfig = {
    streamMode: ['messages', 'updates', 'values'] as ('messages' | 'updates' | 'values')[],
    recursionLimit: 100,
    configurable: {
      workspaceDir: cwd,
      ...(config?.configurable ?? {}),
    },
  };

  try {
    const stream = graph.stream({ messages: inputMessages }, streamConfig);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const item of await stream) {
      const [mode, chunk] = item as [string, unknown];
      // ── messages: stream AI tokens + detect tool calls ───────────────────
      if (mode === 'messages') {
        const [msgChunk, metadata] = chunk as [AIMessageChunk, Record<string, unknown>];
        // if(msgChunk.tool_calls?.length || 0 > 0) continue;
        if (ToolMessage.isInstance(msgChunk))  continue;
        const token = extractText(msgChunk.content);
        if(AIMessageChunk.isInstance(msgChunk)) {
          if (token.length > 0) { responseText += token; print(token); }
          continue;
        }
      }

      if(mode === 'updates') {
        if (AIMessage.isInstance(chunk) && chunk.tool_calls?.length || 0 > 0) { 
          println(`\ntoolcall(s) ${toolCalls.map((tc) => tc.name).join(',')} `);
        }
      }
    

      // ── values: capture final state ──────────────────────────────────────
      if (mode === 'values') {
        const values = chunk as { messages?: BaseMessage[] };
        if (values.messages?.length) finalMessages = values.messages;
        let lastMessage = finalMessages[finalMessages.length - 1];
        if (AIMessage.isInstance(lastMessage)) {
          let aiMessage = lastMessage as AIMessage;
          const toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>
            = aiMessage?.tool_calls ?? [];
          if (toolCalls.length > 0) {
            
            for (const tc of toolCalls) {
              toolRenderer.addTool(tc.id ?? tc.name, tc.name, tc.args ?? {});
            }
            continue;
          }
        }
        if (ToolMessage.isInstance(lastMessage)) {
          // If the final message is a ToolMessage, render its content as well.
          let toolMessage = lastMessage as ToolMessage;
          let id = toolMessage.tool_call_id ?? '';
          const error: string | undefined = toolMessage.status === 'error' ? String(toolMessage.content) : undefined;
          toolRenderer.completeTool(id, toolMessage.status === 'error' ? undefined : toolMessage.content, error);
        }

      }
    }
  } finally {
    toolRenderer.stop();
  }

  // Replace streamed raw text with rendered Markdown in-place.
  if (responseText.length > 0) {
    replaceStreamedLines(responseText, renderMarkdown(responseText));
  }

  return finalMessages;
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

async function runAgent(
  promptArg: string | undefined,
  opts: { interactive: boolean; session: string | undefined; systemPrompt: string | undefined },
): Promise<void> {
  const cwd = process.cwd();
  const model = getModelInstance();
  const toolsModel = getModelInstance({ streaming: false }); // separate non-streaming instance for tools to avoid interleaved output
  const tools = createBuiltinTools(toolsModel);

  // Session name IS the thread ID. Use the provided name, or generate a fresh
  // random 8-char hex ID when -s is omitted.
  const threadId = opts.session ?? randomBytes(4).toString('hex');

  const sessionsDir = defaultSessionsDir();
  mkdirSync(sessionsDir, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(join(sessionsDir, `${threadId}.db`));
  const graph = createAgent({ model, tools, checkpointer });

  const config: RunnableConfig = {
    configurable: {
      thread_id: threadId,
      workspaceDir: cwd,
    },
  };

  /** Read the current context token count from the checkpointer (0 if none). */
  async function getContextTokens(): Promise<number> {
    try {
      const state = await graph.graph.getState(config);
      const msgs = (state.values['messages'] as BaseMessage[] | undefined) ?? [];
      return estimateTokens(msgs);
    } catch {
      return 0;
    }
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const systemPromptPath = opts.systemPrompt
    ? resolve(process.cwd(), opts.systemPrompt)
    : resolve(__dirname, 'SYSTEM.md');
  const systemText = await readFile(systemPromptPath, 'utf-8');
  const prompt = promptArg ?? (await readStdin());

  if (!prompt) { renderError('No prompt provided.'); process.exit(1); }

  // Every thread is new — always seed the SystemMessage.
  const seedMessages: BaseMessage[] = [new SystemMessage(systemText)];

  const headerBase = { cwd, toolCount: tools.length, model: getModelName(), session: threadId };

  renderHeader({ ...headerBase, prompt, contextTokens: await getContextTokens() });

  // Compact before first exchange (no-op on a fresh thread)
  const compResult = await maybeCompact(graph, config, model);
  if (compResult.compacted) renderCompacted(compResult.removedCount);

  await runExchange({ prompt, messages: seedMessages, graph, cwd, config });

  if (opts.interactive) {
    while (true) {
      println("\x1b[2m(Press Ctrl+C to exit)\x1b[0m");
      const next = await readInteractiveLine('\x1b[36m>\x1b[0m ');
      if (!next) break;
      renderHeader({ ...headerBase, prompt: next, contextTokens: await getContextTokens() });

      const cr = await maybeCompact(graph, config, model);
      if (cr.compacted) renderCompacted(cr.removedCount);

      await runExchange({ prompt: next, messages: [], graph, cwd, config });
    }
  }

  renderSessionExit(threadId);
}

const program = new Command()
  .name('mindful')
  .description('Mindful agent CLI')
  .version('0.1.5')
  .option('-i, --interactive', 'Stay in a REPL loop', false)
  .option('-s, --session <name>', 'Session name / thread ID (omit for a fresh random ID)')
  .option('-p, --system-prompt <file>', 'Path to system prompt file (default: built-in SYSTEM.md)')
  .argument('[prompt]', 'Prompt to run (reads stdin if omitted)')
  .action(async (promptArg: string | undefined, opts: { interactive: boolean; session: string | undefined; systemPrompt: string | undefined }) => {
    await runAgent(promptArg, opts);
  });

if (process.argv[1]?.endsWith('run-agent.ts') || process.argv[1]?.endsWith('run-agent.js')) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    logger.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
