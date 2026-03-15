#!/usr/bin/env node
/**
 * Mindful CLI — agent runner.
 *
 * Usage:
 *   pnpm --filter cli run-agent "Your prompt here"
 *   pnpm --filter cli run-agent -i "Your prompt"   # interactive REPL
 *
 * Env vars are loaded from ../.env via --env-file flag in the npm script.
 */

import * as readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { Command } from 'commander';
import { createAgent } from 'langchain';
import { getModelInstance } from 'agent';
import { createBuiltinTools } from 'core';
import { createLogger } from 'core';
import {
  print,
  println,
  renderHeader,
  renderMarkdown,
  renderError,
  ConcurrentToolRenderer,
} from './render.js';

const logger = createLogger('cli');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModelName(): string {
  return process.env['LLM_MODEL'] ?? 'unknown';
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
}

/**
 * Run one prompt→response exchange.
 *
 * Streaming:
 *   - `messages` mode: stream AI tokens directly; tool call chunks (empty
 *     content, tool_calls populated) trigger addTool on the renderer.
 *   - `updates.tools` fires → completeTool for each result.
 *   - `values` mode: captures the complete final state.
 *
 * A blank line is printed before the first tool call in each exchange.
 * After streaming, raw text is replaced in-place with rendered Markdown.
 */
export async function runExchange(opts: RunExchangeOpts): Promise<BaseMessage[]> {
  const { prompt, messages, graph, cwd } = opts;

  const inputMessages: BaseMessage[] = [...messages, new HumanMessage(prompt)];
  const toolRenderer = new ConcurrentToolRenderer();

  let finalMessages: BaseMessage[] = inputMessages;
  let responseText = '';
  let toolSectionStarted = false;

  try {
    const stream = graph.stream(
      { messages: inputMessages },
      {
        streamMode: ['messages', 'updates', 'values'] as const,
        recursionLimit: 100,
        configurable: { workspaceDir: cwd },
      },
    );

    for await (const [mode, chunk] of await stream) {
      // ── messages: stream AI tokens + detect tool calls ───────────────────
      if (mode === 'messages') {
        const [msgChunk, metadata] = chunk as [unknown, Record<string, unknown>];
        if ((metadata?.['langgraph_node'] as string) === 'tools') continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = msgChunk as any;
        if ((typeof msg._getType === 'function' ? msg._getType() : null) !== 'ai') continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> =
          msg.tool_calls ?? [];
        if (toolCalls.length > 0) {
          if (!toolSectionStarted) { println(); toolSectionStarted = true; }
          for (const tc of toolCalls) {
            toolRenderer.addTool(tc.id ?? tc.name, tc.name, tc.args ?? {});
          }
          continue;
        }

        const token = extractText(msg.content);
        if (token.length > 0) { responseText += token; print(token); }
        continue;
      }

      // ── updates: complete tool calls ─────────────────────────────────────
      if (mode === 'updates') {
        const updates = chunk as Record<string, { messages?: BaseMessage[] }>;
        if (updates['tools']?.messages) {
          for (const msg of updates['tools'].messages) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const m = msg as any;
            if ((typeof m._getType === 'function' ? m._getType() : null) !== 'tool') continue;
            const id: string = m.tool_call_id ?? '';
            const error: string | undefined = m.status === 'error' ? String(m.content) : undefined;
            toolRenderer.completeTool(id, m.status === 'error' ? undefined : m.content, error);
          }
          toolRenderer.stop();
          println();
          toolSectionStarted = false;
        }
        continue;
      }

      // ── values: capture final state ──────────────────────────────────────
      if (mode === 'values') {
        const values = chunk as { messages?: BaseMessage[] };
        if (values.messages?.length) finalMessages = values.messages;
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

async function runAgent(promptArg: string | undefined, opts: { interactive: boolean }): Promise<void> {
  const cwd = process.cwd();
  const tools = createBuiltinTools();
  const model = getModelInstance();
  const graph = createAgent({ model, tools });

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const systemText = await readFile(resolve(__dirname, 'SYSTEM.md'), 'utf-8');
  const prompt = promptArg ?? (await readStdin());

  if (!prompt) { renderError('No prompt provided.'); process.exit(1); }
  renderHeader({ prompt, cwd, toolCount: tools.length, model: getModelName() });
  let messages: BaseMessage[] = [new SystemMessage(systemText)];
  messages = await runExchange({ prompt, messages, graph, cwd });
  if (opts.interactive) {
    while (true) {
      println();
      const next = await readInteractiveLine('\x1b[36m>\x1b[0m ');
      if (!next) break;
      renderHeader({ prompt: next, cwd, toolCount: tools.length, model: getModelName() });
      messages = await runExchange({ prompt: next, messages, graph, cwd });
    }
    println('\x1b[2m(session ended)\x1b[0m');
  }
}

const program = new Command()
  .name('mindful')
  .description('Mindful agent CLI')
  .version('0.1.5')
  .option('-i, --interactive', 'Stay in a REPL loop', false)
  .argument('[prompt]', 'Prompt to run (reads stdin if omitted)')
  .action(async (promptArg: string | undefined, opts: { interactive: boolean }) => {
    await runAgent(promptArg, opts);
  });

if (process.argv[1]?.endsWith('run-agent.ts') || process.argv[1]?.endsWith('run-agent.js')) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    logger.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
