/**
 * render.ts — all terminal display helpers for the Mindful CLI.
 *
 * Color is auto-detected by chalk (respects NO_COLOR / FORCE_COLOR env vars
 * and non-TTY pipes — chalk.level drops to 0 automatically).
 */

import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

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

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

// ─── Header ───────────────────────────────────────────────────────────────────

export interface HeaderInfo {
  prompt: string;
  cwd: string;
  toolCount: number;
  model: string;
  session: string;
  contextTokens: number;
}

/** Format a token count as an abbreviated string: 0 → "0", 1234 → "1.2k". */
function formatTokens(n: number): string {
  if (n === 0) return '0';
  return (n / 1000).toFixed(1) + 'k';
}

/**
 * Render a colored box header above the agent response.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  mindful agent                         model: gpt-5.1-codex        │
 * │  tools: 10                             cwd: ~/projects/foo          │
 * │  prompt: Explain the auth flow                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export function renderHeader(info: HeaderInfo): void {
  const meta = [
    chalk.dim('model') + ' ' + chalk.white(info.model),
    chalk.dim('tools') + ' ' + chalk.white(String(info.toolCount)),
    chalk.dim('session') + ' ' + chalk.white(info.session),
    chalk.dim('ctx') + ' ' + chalk.white(formatTokens(info.contextTokens)),
    chalk.dim('cwd') + ' ' + chalk.white(truncate(info.cwd, 40)),
  ].join(chalk.dim('  ·  '));

  println("----------------------------------------------------------");
  println(chalk.bold.cyan('mindful') + '  ' + meta);
  println(chalk.dim('▸') + ' ' + chalk.bold(truncate(info.prompt, (process.stdout.columns ?? 80) - 4)));
  println();
}

// ─── Tool panels ──────────────────────────────────────────────────────────────

/** Format args as a compact key=value string, truncated. */
function formatArgs(args: Record<string, unknown>, maxLen = 80): string {
  const parts = Object.entries(args).map(([k, v]) => {
    const val =
      typeof v === 'string'
        ? truncate(v.replace(/\n/g, '↵'), 50)
        : truncate(JSON.stringify(v), 50);
    return `${chalk.dim(k + '=')}${chalk.white(val)}`;
  });
  return truncate(parts.join('  '), maxLen);
}

/** Produce a human-readable one-liner summary of a tool result. */
function summariseResult(result: unknown): string {
  if (result === null || result === undefined) return chalk.dim('(empty)');
  if (typeof result === 'string') {
    return chalk.white( `result ${result.length} character${result.length !== 1 ? 's' : ''}` + chalk.dim(`  ${truncate(result, 80)}`));
  }
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
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
    return chalk.dim(truncate(JSON.stringify(result), 80));
  }
  return chalk.dim(String(result));
}

export function formatNotice(lead: string,notice: string):string {
  return chalk.yellowBright('*') + '  ' + chalk.bold(lead) + '  ' + chalk.bold(notice);
}


/** Format an in-progress tool line (printed as soon as the tool is dispatched). */
export function formatToolPending(name: string, args: Record<string, unknown>): string {
  return chalk.yellowBright('-') + '  ' + chalk.bold(name) + '  ' + chalk.dim(formatArgs(args));
}

/** Format a completed tool line. */
export function formatToolDone(
  name: string,
  result: unknown,
  error: string | undefined,
  elapsedMs: number,
): string {
  if (error) {
    return (
      chalk.red('✗') +
      '  ' +
      chalk.bold(name) +
      '  ' +
      chalk.dim(truncate(error, 60)) +
      chalk.dim(`  (${elapsedMs}ms)`)
    );
  }
  return (
    chalk.green('✓') +
    '  ' +
    chalk.bold(name) +
    '  ' +
    summariseResult(result) +
    chalk.dim(`  (${elapsedMs}ms)`)
  );
}

interface ToolEntry {
  name: string;
  args: Record<string, unknown>;
  startTime: number;
}

/**
 * Renders tool call results in the terminal.
 * Prints one ✓/✗ line per tool when it completes.
 */
export class ConcurrentToolRenderer {
  private entries = new Map<string, ToolEntry>();

  addTool(id: string, name: string, args: Record<string, unknown>): void {
    const isNew = !this.entries.has(id);
    this.entries.set(id, { name, args, startTime: Date.now() });
    // Print the pending line exactly once per tool call ID.
    // name.length > 0 guards against LLM streaming delta chunks where both
    // id and name arrive as empty strings (only the first real chunk has them).
    if (isNew && name.length > 0) {
      println(formatToolPending(name, args));
    }
  }

  completeTool(id: string, result: unknown, error: string | undefined): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const elapsedMs = Date.now() - entry.startTime;
    println(formatToolDone(entry.name, result, error, elapsedMs));
  }

  stop(): void { /* no-op — kept for call-site compatibility */ }
}

// ─── Markdown rendering ───────────────────────────────────────────────────────

/**
 * Render a Markdown string to ANSI for the terminal.
 * Falls back to plain text when stdout is not a TTY (e.g. when piped).
 */
export function renderMarkdown(text: string): string {
  if (!process.stdout.isTTY) return text;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendered = marked.parse(text, { renderer: new TerminalRenderer({ width: cols() }) as any }) as string;
    return rendered.trimEnd() + '\n';
  } catch {
    return text;
  }
}

// ─── Compaction notice ────────────────────────────────────────────────────────

export function renderCompacted(removedCount: number, newTokens?: number): void {
  const tokenPart = newTokens !== undefined ? `  ${newTokens.toLocaleString()} tokens` : '';
  println(chalk.dim(`⟳ context compacted — ${removedCount} message${removedCount !== 1 ? 's' : ''} summarised${tokenPart}`));
}

export function renderCompactSkipped(): void {
  println(chalk.dim('⟳ context is small — nothing to compact'));
}

// ─── Error display ────────────────────────────────────────────────────────────

export function renderError(message: string): void {
  println(chalk.red('✗ ') + chalk.bold(message));
}

// ─── Session exit ─────────────────────────────────────────────────────────────

export function renderSessionExit(threadId: string, tokens?: number): void {
  const tokenPart = tokens !== undefined ? chalk.dim(`  ${tokens.toLocaleString()} tokens`) : '';
  println(chalk.dim('session  ') + chalk.white(threadId) + tokenPart);
}
