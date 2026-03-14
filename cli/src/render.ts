/**
 * render.ts — all terminal display helpers for the Mindful CLI.
 *
 * Responsibilities:
 *   - Colored header box (session, model, tools, cwd, prompt)
 *   - Tool call panels (tool_start / tool_result)
 *   - Thinking spinner (ora)
 *   - Markdown rendering on completion (marked + marked-terminal)
 *   - Footer line (cost + session hint)
 *   - Sessions list table
 *
 * Color is auto-detected by chalk (respects NO_COLOR / FORCE_COLOR env vars
 * and non-TTY pipes — chalk.level drops to 0 automatically).
 */

import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import ora, { type Ora } from 'ora';

// ─── Terminal width ────────────────────────────────────────────────────────────

/** Usable column width, capped to avoid wrapping on huge screens. */
function cols(): number {
  return Math.min(process.stdout.columns ?? 80, 88);
}

// ─── Low-level helpers ─────────────────────────────────────────────────────────

export function print(msg: string): void {
  process.stdout.write(msg);
}

export function println(msg = ''): void {
  process.stdout.write(msg + '\n');
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

// ─── Header ───────────────────────────────────────────────────────────────────

export interface HeaderInfo {
  prompt: string;
  cwd: string;
  toolCount: number;
  sessionId: string;
  model: string;
  resuming: boolean;
}

/**
 * Render a colored box header above the agent response.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  mindful agent                         session: a3f1bc92 (new)     │
 * │  model: gpt-5.1-codex · tools: 10      cwd: ~/projects/foo         │
 * │  prompt: Explain the auth flow                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export function renderHeader(info: HeaderInfo): void {
  const width = cols();
  const inner = width - 2; // exclude border chars

  const sessionTag = info.resuming
    ? chalk.cyan(`session: ${info.sessionId}`) + chalk.dim(' (resuming)')
    : chalk.cyan(`session: ${info.sessionId}`) + chalk.dim(' (new)');

  const modelTag = chalk.dim('model: ') + chalk.white(info.model);
  const toolsTag = chalk.dim('tools: ') + chalk.white(String(info.toolCount));
  const cwdTag = chalk.dim('cwd: ') + chalk.white(truncate(info.cwd, 40));
  const promptTag = chalk.dim('prompt: ') + chalk.bold.white(truncate(info.prompt, inner - 10));

  // Row 1: "mindful agent" left, session right
  const appLabel = chalk.bold.cyan('mindful agent');
  const row1Left = `  ${appLabel}`;
  // Strip ANSI to measure real length for padding
  const row1LeftLen = 2 + 'mindful agent'.length;
  const row1RightStripped = `session: ${info.sessionId}${info.resuming ? ' (resuming)' : ' (new)'}`;
  const row1Padding = Math.max(0, inner - row1LeftLen - row1RightStripped.length - 2);
  const row1 = `│${row1Left}${' '.repeat(row1Padding)}  ${sessionTag}  │`;

  // Row 2: model · tools left, cwd right
  const row2Left = `  ${modelTag} ${chalk.dim('·')} ${toolsTag}`;
  const row2LeftLen = 2 + `model: ${info.model} · tools: ${info.toolCount}`.length;
  const cwdStripped = `cwd: ${truncate(info.cwd, 40)}`;
  const row2Padding = Math.max(0, inner - row2LeftLen - cwdStripped.length - 2);
  const row2 = `│${row2Left}${' '.repeat(row2Padding)}  ${cwdTag}  │`;

  // Row 3: prompt (full width)
  const promptStripped = `prompt: ${truncate(info.prompt, inner - 10)}`;
  const row3Padding = Math.max(0, inner - promptStripped.length - 2);
  const row3 = `│  ${promptTag}${' '.repeat(row3Padding)}  │`;

  const top = chalk.dim('┌' + '─'.repeat(width - 2) + '┐');
  const bot = chalk.dim('└' + '─'.repeat(width - 2) + '┘');

  println();
  println(top);
  println(row1);
  println(row2);
  println(row3);
  println(bot);
  println();
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

/** Start a thinking spinner. Returns the ora instance — call stop() on it. */
export function spinnerStart(text = 'thinking…'): Ora {
  return ora({
    text: chalk.dim(text),
    color: 'cyan',
    stream: process.stdout,
    isSilent: !process.stdout.isTTY,
  }).start();
}

// ─── Tool panels ──────────────────────────────────────────────────────────────

/** Format args as a compact key=value string, truncated. */
function formatArgs(args: Record<string, unknown>, maxLen = 120): string {
  const parts = Object.entries(args).map(([k, v]) => {
    const val =
      typeof v === 'string'
        ? truncate(v.replace(/\n/g, '↵'), 60)
        : truncate(JSON.stringify(v), 60);
    return `${chalk.dim(k + '=')}${val}`;
  });
  return truncate(parts.join('  '), maxLen);
}

/**
 * Render the opening of a tool call panel.
 *
 *   ╔ bash ────────────────────────────────────────────────────╗
 *     command=ls -la /src
 */
export function renderToolStart(name: string, args: Record<string, unknown>): void {
  const w = cols();
  const label = chalk.bold.cyan(` ${name} `);
  const labelLen = 1 + name.length + 1; // space + name + space
  const lineLen = w - 4 - labelLen; // 4 = '╔ ' + ' ─╗'... approximate
  const topLine = chalk.dim('╔ ') + label + chalk.dim('─'.repeat(Math.max(2, lineLen)) + '╗');
  println(topLine);
  if (Object.keys(args).length > 0) {
    println(chalk.dim('  ') + formatArgs(args));
  }
  println(chalk.dim('╟' + '─'.repeat(w - 2) + '╢'));
}

/**
 * Render the closing of a tool call panel.
 *
 *   ╟──────────────────────────────────────────────────────────╢
 *     ✓ 14 lines  (82ms)   — or —   ✗ command not found
 *   ╚══════════════════════════════════════════════════════════╝
 *
 * When `verboseContent` is provided (verbose mode), its lines are printed
 * between the result line and the closing border (capped at 50 lines).
 */
export function renderToolResult(
  name: string,
  result: unknown,
  error: string | undefined,
  elapsedMs: number,
  verboseContent?: string,
): void {
  const w = cols();
  if (error) {
    println(chalk.red('  ✗ ') + chalk.dim(truncate(error, w - 6)));
  } else {
    const summary = summariseResult(result);
    println(
      chalk.green('  ✓ ') +
        chalk.dim(name) +
        '  ' +
        summary +
        chalk.dim(`  (${elapsedMs}ms)`),
    );
  }
  if (verboseContent) {
    const lines = verboseContent.split('\n');
    const display = lines.slice(0, 50);
    for (const line of display) {
      println(chalk.dim('  │ ') + line);
    }
    if (lines.length > 50) {
      println(chalk.dim('  │ … (truncated)'));
    }
  }
  println(chalk.dim('╚' + '═'.repeat(w - 2) + '╝'));
  println();
}

/** Produce a human-readable one-liner summary of a tool result. */
function summariseResult(result: unknown): string {
  if (result === null || result === undefined) return chalk.dim('(empty)');
  if (typeof result === 'string') {
    const lines = result.split('\n').length;
    const bytes = Buffer.byteLength(result, 'utf8');
    return chalk.white(`${lines} line${lines !== 1 ? 's' : ''}`) + chalk.dim(`  ${bytes}b`);
  }
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    // Common tool result shapes
    if (typeof obj['content'] === 'string') {
      const lines = String(obj['content']).split('\n').length;
      const bytes = Buffer.byteLength(String(obj['content']), 'utf8');
      return chalk.white(`${lines} line${lines !== 1 ? 's' : ''}`) + chalk.dim(`  ${bytes}b`);
    }
    if (obj['success'] === true || obj['success'] === false) {
      const ok = obj['success'] as boolean;
      const extra =
        typeof obj['stdout'] === 'string'
          ? chalk.dim(`  ${String(obj['stdout']).split('\n').length} lines stdout`)
          : '';
      return (ok ? chalk.green('ok') : chalk.red('failed')) + extra;
    }
    const raw = JSON.stringify(result);
    return chalk.dim(truncate(raw, 80));
  }
  return chalk.dim(String(result));
}

// ─── Markdown rendering ───────────────────────────────────────────────────────

/**
 * Render a Markdown string to ANSI for the terminal.
 * Falls back to plain text when stdout is not a TTY (e.g. when piped).
 *
 * Note: marked@15 validates renderer property names strictly, so we must NOT
 * use marked.use({ renderer }) at module load time.  Instead, we pass the
 * TerminalRenderer instance directly to marked.parse() on each call, which
 * bypasses the property-name validator entirely.
 */
export function renderMarkdown(text: string): string {
  if (!process.stdout.isTTY) return text;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendered = marked.parse(text, { renderer: new TerminalRenderer({ width: cols() }) as any }) as string;
    // marked-terminal appends \n\n after every top-level block; normalise to
    // exactly one trailing newline so the footer sits flush below the response.
    return rendered.trimEnd() + '\n';
  } catch {
    return text;
  }
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function renderFooter(totalCost: number, sessionId: string): void {
  println();
  println(
    chalk.dim('  cost: ') +
      chalk.white(`$${totalCost.toFixed(6)}`) +
      chalk.dim('   session: ') +
      chalk.cyan(sessionId) +
      chalk.dim(`  (--session ${sessionId} to resume)`),
  );
  println();
}

// ─── Sessions list ────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  messageCount: number;
  updatedAt: string;
  summary?: string;
}

export function renderSessionsList(sessions: SessionRow[]): void {
  if (sessions.length === 0) {
    println(chalk.dim('  No sessions found.'));
    return;
  }

  println();
  println(
    chalk.dim('  ' + pad('ID', 10) + pad('MESSAGES', 10) + pad('UPDATED', 26) + 'SUMMARY'),
  );
  println(chalk.dim('  ' + '─'.repeat(cols() - 2)));

  for (const s of sessions) {
    const updated = new Date(s.updatedAt).toLocaleString();
    const summary = s.summary ? truncate(s.summary, 40) : chalk.dim('—');
    println(
      '  ' +
        chalk.cyan(pad(s.id, 10)) +
        chalk.dim(pad(String(s.messageCount), 10)) +
        chalk.dim(pad(updated, 26)) +
        summary,
    );
  }
  println();
}

// ─── Error display ────────────────────────────────────────────────────────────

export function renderError(message: string): void {
  println(chalk.red('  ✗ ') + chalk.bold(message));
}
