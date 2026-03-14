#!/usr/bin/env node
/**
 * Mindful CLI — agent runner.
 *
 * Usage:
 *   pnpm --filter cli run-agent "Your prompt here"
 *   pnpm --filter cli run-agent --cwd /some/dir "Your prompt"
 *   pnpm --filter cli run-agent --tools read,bash "Your prompt"
 *   pnpm --filter cli run-agent --session <id> "Your prompt"
 *   pnpm --filter cli run-agent --interactive
 *   pnpm --filter cli run-agent sessions
 *
 * Env vars are loaded from server/.env via --env-file flag in the npm script.
 */

import * as readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { AgentRunner } from 'agent';
import { buildSystemPrompt } from 'agent';
import { createLLMChain } from 'agent';
import { createBuiltinTools, builtinToolNames, type BuiltinToolName } from 'core';
import type { Tool, ToolContext } from 'core';
import { createLogger } from 'core';
import {
  CliContextStore,
  DEFAULT_CONTEXT_DIR,
  type CliMessage,
  type CliHistoryMessage,
} from './context-store.js';
import {
  print,
  println,
  renderHeader,
  renderToolStart,
  renderToolResult,
  renderMarkdown,
  renderFooter,
  renderSessionsList,
  renderError,
  spinnerStart,
} from './render.js';

const logger = createLogger('cli');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

function getModelName(): string {
  return process.env['LLM_MODEL'] ?? 'gpt-5.1-codex';
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
 *
 * NOTE: Do NOT attach a 'close' listener here. When the question callback
 * calls rl.close(), Node.js synchronously emits 'close' — if we resolve(null)
 * there it races with (and beats) the resolve(trimmed) in the question
 * callback, causing every turn to be treated as empty input and the REPL to
 * exit immediately.
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

// ─── `sessions` subcommand ────────────────────────────────────────────────────

async function handleListSessions(opts: { contextDir: string }): Promise<void> {
  const store = new CliContextStore(opts.contextDir);
  const sessions = await store.listSessions();
  renderSessionsList(sessions);
}

// ─── Core run logic (single exchange) ────────────────────────────────────────

interface RunExchangeOpts {
  prompt: string;
  runner: AgentRunner;
  store: CliContextStore;
  sessionId: string;
  selectedTools: Tool[];
  toolExecutor: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ result: unknown; error?: string }>;
  history: CliHistoryMessage[];
  nextSeq: number;
  verbose: boolean;
}

interface RunExchangeResult {
  newMessages: CliMessage[];
  nextSeq: number;
  /** Full accumulated assistant response text (for Markdown re-render). */
  responseText: string;
}

async function runExchange(opts: RunExchangeOpts): Promise<RunExchangeResult> {
  const { prompt, runner, store, sessionId, selectedTools, toolExecutor, history, nextSeq: startSeq, verbose } = opts;

  // Append user turn to history for this run
  const runHistory = [...history, { role: 'user' as const, content: prompt }];

  const newMessages: CliMessage[] = [];
  let nextSeq = startSeq;

  newMessages.push({
    seq: nextSeq++,
    role: 'user',
    content: prompt,
    createdAt: new Date().toISOString(),
  });

  // Track accumulated response for Markdown re-render
  let responseText = '';
  let inlineTokensActive = false;

  // Spinner — stops on first token
  const spinner = spinnerStart();

  // Per-tool timing
  const toolStartTimes = new Map<string, number>();

  for await (const event of runner.stream({
    input: prompt,
    tools: selectedTools,
    toolExecutor,
    history: runHistory,
  })) {
    switch (event.type) {
      case 'token': {
        if (spinner.isSpinning) spinner.stop();
        if (!inlineTokensActive) inlineTokensActive = true;
        responseText += event.content;
        print(event.content);
        break;
      }

      case 'tool_start': {
        if (spinner.isSpinning) spinner.stop();
        // Flush any partial token line
        if (inlineTokensActive) { println(); inlineTokensActive = false; }
        toolStartTimes.set(event.id ?? event.name, Date.now());
        renderToolStart(event.name, event.args as Record<string, unknown>);
        break;
      }

      case 'tool_result': {
        if (spinner.isSpinning) spinner.stop();
        if (inlineTokensActive) { println(); inlineTokensActive = false; }
        const startedAt = toolStartTimes.get(event.id ?? event.name) ?? Date.now();
        const elapsed = Date.now() - startedAt;
        toolStartTimes.delete(event.id ?? event.name);

        renderToolResult(event.name, event.result, event.error, elapsed, verbose ? String(event.result ?? '') : undefined);

        const content = event.error ?? JSON.stringify(event.result);
        newMessages.push({
          seq: nextSeq++,
          role: 'tool',
          content,
          toolCallId: event.id,
          toolName: event.name,
          createdAt: new Date().toISOString(),
        });
        break;
      }

      case 'done': {
        if (spinner.isSpinning) spinner.stop();
        if (inlineTokensActive) {
          if (process.stdout.isTTY && responseText.length > 0) {
            // Overwrite raw streamed tokens with Markdown-rendered version
            const rawLines = Math.max(1, (responseText.match(/\n/g) ?? []).length + 1);
            process.stdout.write(`\x1b[${rawLines}A\x1b[0J`);
          } else {
            // Non-TTY: tokens already printed; ensure cursor is on a fresh line
            if (!responseText.endsWith('\n')) println();
          }
          inlineTokensActive = false;
        }

        // Re-render as Markdown on TTY only — non-TTY already printed the raw tokens above
        if (responseText.length > 0 && process.stdout.isTTY) {
          print(renderMarkdown(responseText));
        }

        // Collect fresh assistant messages
        const contextLen = history.filter((m) => m.role !== 'system').length + 1; // +1 for current user msg
        const freshMsgs = event.messages
          .filter((m) => m.role === 'assistant' || m.role === 'tool')
          .slice(contextLen - 1);

        for (const m of freshMsgs) {
          if (m.role === 'assistant') {
            newMessages.push({
              seq: nextSeq++,
              role: 'assistant',
              content: m.content,
              ...(m.tool_calls ? { toolCalls: m.tool_calls } : {}),
              createdAt: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case 'error': {
        if (spinner.isSpinning) spinner.stop();
        if (inlineTokensActive) { println(); inlineTokensActive = false; }
        renderError(`stream error: ${event.message}`);
        break;
      }
    }
  }

  // Persist new messages to disk
  await store.appendMessages(sessionId, newMessages);

  return { newMessages, nextSeq, responseText };
}

// ─── `run` subcommand action ──────────────────────────────────────────────────

interface RunOptions {
  cwd: string;
  tools?: string;
  contextDir: string;
  session?: string;
  interactive: boolean;
  verbose: boolean;
}

async function runAgent(promptArg: string | undefined, opts: RunOptions): Promise<void> {
  const { cwd, contextDir, verbose } = opts;

  // ── Build tools ──────────────────────────────────────────────────────────
  const allTools = createBuiltinTools();
  const toolFilter: BuiltinToolName[] | 'all' = opts.tools
    ? opts.tools
        .split(',')
        .map((t) => t.trim())
        .filter((t): t is BuiltinToolName =>
          (builtinToolNames as readonly string[]).includes(t),
        )
    : 'all';

  const selectedTools: Tool[] =
    toolFilter === 'all'
      ? allTools
      : allTools.filter((t) => (toolFilter as string[]).includes(t.name));

  const context: ToolContext = { workspaceDir: cwd };
  const toolExecutor = async (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; error?: string }> => {
    const tool = selectedTools.find((t) => t.name === toolName);
    if (!tool) return { result: null, error: `Tool "${toolName}" not found` };
    try {
      const result = await tool.execute(args, {
        ...context,
        ...(verbose && {
          onChunk: (text: string) => {
            print(chalk.dim(text));
          },
        }),
      });
      return { result };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // ── Build LLM chain ──────────────────────────────────────────────────────
  let llmChain;
  try {
    llmChain = createLLMChain();
  } catch (err) {
    renderError(`Failed to create LLM chain: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const runner = new AgentRunner({ llmChain });

  // ── Session ──────────────────────────────────────────────────────────────
  const store = new CliContextStore(contextDir);
  let session;
  if (opts.session) {
    session = await store.getSession(opts.session);
    if (!session) {
      renderError(`Session "${opts.session}" not found. Run "sessions" to list available sessions.`);
      process.exit(1);
    }
  } else {
    session = await store.createSession();
  }

  // ── System prompt + history ──────────────────────────────────────────────
  // Load CLI-specific identity from SYSTEM.md (co-located with this source file)
  const systemMdPath = fileURLToPath(new URL('./SYSTEM.md', import.meta.url));
  const cliSystemPrompt = await readFile(systemMdPath, 'utf8').catch(() => undefined);

  const systemPromptContent = await buildSystemPrompt({
    tools: selectedTools,
    workspaceDir: cwd,
    agentSystemPrompt: cliSystemPrompt,
  });
  let history = await store.buildHistory(session.id, systemPromptContent);
  let nextSeq = (await store.readMessages(session.id)).length + 1;

  // ── One-shot mode ─────────────────────────────────────────────────────────
  if (!opts.interactive) {
    const prompt = promptArg ?? (await readStdin());
    if (!prompt) {
      renderError('No prompt provided.');
      process.exit(1);
    }

    renderHeader({
      prompt,
      cwd,
      toolCount: selectedTools.length,
      sessionId: session.id,
      model: getModelName(),
      resuming: !!opts.session,
    });

    const { nextSeq: finalSeq } = await runExchange({
      prompt,
      runner,
      store,
      sessionId: session.id,
      selectedTools,
      toolExecutor,
      history,
      nextSeq,
      verbose,
    });

    renderFooter(runner.getTotalCost(), session.id);
    logger.debug('done', { totalSeq: finalSeq });
    return;
  }

  // ── Interactive REPL mode ─────────────────────────────────────────────────
  // First prompt: from arg or stdin if provided, otherwise ask in loop
  let firstPrompt = promptArg;

  println();
  println(
    `  Interactive session  ${session.id}${opts.session ? '  (resumed)' : ''}` +
      `  —  type an empty line or Ctrl-C to exit`,
  );
  println();

  while (true) {
    let prompt: string | null;

    if (firstPrompt) {
      prompt = firstPrompt;
      firstPrompt = undefined;
    } else {
      prompt = await readInteractiveLine('\x1b[36myou>\x1b[0m  ');
    }

    if (!prompt) {
      println('\n  Goodbye.');
      break;
    }

    // Rebuild history each turn so it includes messages from previous turns
    history = await store.buildHistory(session.id, systemPromptContent);
    nextSeq = (await store.readMessages(session.id)).length + 1;

    await runExchange({
      prompt,
      runner,
      store,
      sessionId: session.id,
      selectedTools,
      toolExecutor,
      history,
      nextSeq,
      verbose,
    });

    renderFooter(runner.getTotalCost(), session.id);
  }
}

// ─── Program ──────────────────────────────────────────────────────────────────

const program = new Command()
  .name('mindful')
  .description('Mindful agent CLI')
  .version('0.1.5')
  .option('-c, --cwd <dir>', 'Working directory', process.cwd())
  .option('-t, --tools <names>', 'Comma-separated tool names (default: all)')
  .option('--context-dir <path>', 'Context directory', DEFAULT_CONTEXT_DIR)
  .option('-s, --session <id>', 'Resume a specific session by ID')
  .option('-i, --interactive', 'Stay in a REPL loop', false)
  .option('-v, --verbose', 'Stream live tool output and show full results', false)
  .argument('[prompt]', 'Prompt to run (reads stdin if omitted)')
  .action(async (promptArg: string | undefined, opts: RunOptions) => {
    await runAgent(promptArg, opts);
  });

program
  .command('sessions')
  .description('List all saved sessions')
  .option('--context-dir <path>', 'Context directory', DEFAULT_CONTEXT_DIR)
  .action(async (opts: { contextDir: string }) => {
    await handleListSessions(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
