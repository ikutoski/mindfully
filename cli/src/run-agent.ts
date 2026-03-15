#!/usr/bin/env node
/**
 * Mindful CLI — agent runner.
 *
 * Usage:
 *   pnpm --filter cli run-agent "Your prompt here"
 *   pnpm --filter cli run-agent -i "Your prompt"   # interactive REPL
 *
 * Env vars are loaded from server/.env via --env-file flag in the npm script.
 */

import * as readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { collapseToolCallChunks } from "@langchain/core/messages";
import { Command } from 'commander';
import { getModelInstance } from 'agent';
import { createBuiltinTools } from 'core';
import { createLogger } from 'core';
import {
  print,
  println,
  renderHeader,
  renderToolStart,
  renderToolResult,
  renderMarkdown,
  renderError,
  spinnerStart,
} from './render.js';
import { createAgent } from 'langchain';
import { resolve } from 'node:path';

const logger = createLogger('cli');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModelName(): string {
  return process.env['LLM_MODEL'] ?? 'glm-5';
}

// ─── Stdin helpers ────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question('Enter your prompt: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

/**
 * Read a line interactively with a styled prompt prefix.
 * Returns null on Ctrl-C, EOF, or empty input.
 */
async function readInteractiveLine(prefix: string): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prefix, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed.length > 0 ? trimmed : null);
    });
    rl.on('SIGINT', () => {
      rl.close();
      resolve(null);
    });
  });
}

// ─── Core run logic (single exchange) ────────────────────────────────────────

interface RunExchangeOpts {
  prompt: string;
  messages: BaseMessage[];
  graph: ReturnType<typeof getModelInstance>;
  cwd: string;
}

async function runExchange(opts: RunExchangeOpts) {

}

// ─── `run` subcommand action ──────────────────────────────────────────────────

interface RunOptions {
  interactive: boolean;
}

async function runAgent(promptArg: string | undefined, opts: RunOptions): Promise<void> {
  const cwd = process.cwd();
  const tools = createBuiltinTools();
  const model = getModelInstance(tools);
  logger.info('Agent invoke');
  // 2. Stream the response and collect chunks
  let finalChunk;
  // const stream = await model.stream("use tools as much as possible, What is the weather in Tokyo?");
  const agent = createAgent({ model, tools });
  // read System.md from disk
  const systemMessage = new SystemMessage(await readFile(resolve(fileURLToPath(import.meta.url), '../System.md'), 'utf-8'));
  const stream = await agent.stream({
    messages: [
      systemMessage,
      new HumanMessage(promptArg ?? await readStdin())
    ]
  }, { streamMode: ['messages'] });
  for await (const [mode, [chunk, metadata]] of stream) {
    // Skip tool call chunks
    const toolCallChunks = (chunk as AIMessageChunk).tool_call_chunks ?? [];
    if (toolCallChunks.length > 0) continue;
    // Skip anything from the tools node
    if (metadata?.langgraph_node === "tools") continue;
    // Skip empty content
    if (!chunk.content) continue;
    // console.log('Received chunk:', { mode, chunk, metadata });
    if (typeof chunk.content === 'string') {
      process.stdout.write(chunk.content);
    }
  }
}

// ─── Program ─────────────────────────────────────────────────────────────────

const program = new Command()
  .name('mindful')
  .description('Mindful agent CLI')
  .version('0.1.5')
  .option('-i, --interactive', 'Stay in a REPL loop', false)
  .argument('[prompt]', 'Prompt to run (reads stdin if omitted)')
  .action(async (promptArg: string | undefined, opts: RunOptions) => {
    await runAgent(promptArg, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
