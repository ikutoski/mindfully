/**
 * CliContextStore — local filesystem persistence for CLI agent sessions.
 *
 * Storage layout:
 *   <contextDir>/
 *     sessions.json          — index of all sessions (id → SessionMeta)
 *     <session-id>.jsonl     — one CliMessage JSON object per line
 *
 * Default contextDir: ~/.mindful/cli-sessions/
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from 'core';

const logger = createLogger('agent:context-store');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionMeta {
  id: string;
  createdAt: string;   // ISO string
  updatedAt: string;   // ISO string
  messageCount: number;
  summary?: string;
  summaryUpTo?: number;  // sequence number of last message included in summary
}

export interface CliMessage {
  seq: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  toolCallId?: string;
  toolName?: string;
  createdAt: string;  // ISO string
}

/** Shape that AgentRunner.stream() history expects. */
export interface CliHistoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  toolCallId?: string;
  toolName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CONTEXT_DIR = path.join(os.homedir(), '.mindful', 'cli-sessions');
const SESSIONS_FILE = 'sessions.json';
const DEFAULT_WINDOW_SIZE = 20;
const SUMMARY_MODEL = process.env['SUMMARY_MODEL'] ?? 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short random session ID (8 hex chars). */
function generateId(): string {
  return Math.random().toString(16).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// CliContextStore
// ---------------------------------------------------------------------------

export class CliContextStore {
  private readonly contextDir: string;
  private readonly sessionsPath: string;

  constructor(contextDir: string = DEFAULT_CONTEXT_DIR) {
    this.contextDir = contextDir;
    this.sessionsPath = path.join(contextDir, SESSIONS_FILE);
  }

  // ─── Directory / index helpers ────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.contextDir, { recursive: true });
  }

  private async readIndex(): Promise<Record<string, SessionMeta>> {
    try {
      const raw = await fs.readFile(this.sessionsPath, 'utf-8');
      return JSON.parse(raw) as Record<string, SessionMeta>;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return {};
      throw err;
    }
  }

  private async writeIndex(index: Record<string, SessionMeta>): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.sessionsPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private jsonlPath(sessionId: string): string {
    return path.join(this.contextDir, `${sessionId}.jsonl`);
  }

  // ─── Session management ───────────────────────────────────────────────────

  async listSessions(): Promise<SessionMeta[]> {
    const index = await this.readIndex();
    return Object.values(index).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async createSession(): Promise<SessionMeta> {
    await this.ensureDir();
    const index = await this.readIndex();
    const meta: SessionMeta = {
      id: generateId(),
      createdAt: now(),
      updatedAt: now(),
      messageCount: 0,
    };
    index[meta.id] = meta;
    await this.writeIndex(index);
    logger.debug('session created', { id: meta.id });
    return meta;
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const index = await this.readIndex();
    return index[id] ?? null;
  }

  private async updateMeta(
    sessionId: string,
    patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
  ): Promise<void> {
    const index = await this.readIndex();
    const existing = index[sessionId];
    if (!existing) throw new Error(`Session "${sessionId}" not found in index`);
    index[sessionId] = { ...existing, ...patch, updatedAt: now() };
    await this.writeIndex(index);
  }

  // ─── Message I/O ──────────────────────────────────────────────────────────

  async appendMessages(sessionId: string, messages: CliMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.ensureDir();

    const lines = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await fs.appendFile(this.jsonlPath(sessionId), lines, 'utf-8');

    const index = await this.readIndex();
    const meta = index[sessionId];
    if (meta) {
      await this.updateMeta(sessionId, {
        messageCount: (meta.messageCount ?? 0) + messages.length,
      });
    }
    logger.debug('messages appended', { sessionId, count: messages.length });
  }

  async readMessages(sessionId: string): Promise<CliMessage[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.jsonlPath(sessionId), 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw err;
    }

    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CliMessage);
  }

  // ─── Summarisation ────────────────────────────────────────────────────────

  /**
   * Summarise all messages in the session using an LLM.
   * Writes the summary back to sessions.json and returns the summary text.
   */
  async summarise(sessionId: string, model: string = SUMMARY_MODEL): Promise<string> {
    const messages = await this.readMessages(sessionId);
    if (messages.length === 0) return '';

    const apiKey = process.env['OPENCODE_ZEN_API_KEY'] ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      logger.warn('No API key found — skipping summarisation');
      return '';
    }

    const baseUrl = process.env['OPENCODE_ZEN_BASE_URL'] ?? 'https://api.openai.com/v1';

    // Build a readable transcript for the summarisation prompt
    const transcript = messages
      .map((m) => {
        const prefix = m.role === 'tool' ? `[tool: ${m.toolName ?? 'unknown'}]` : `[${m.role}]`;
        return `${prefix} ${m.content}`;
      })
      .join('\n\n');

    const systemMsg = {
      role: 'system' as const,
      content:
        'You are a conversation summariser. ' +
        'Produce a concise but complete summary of the following conversation transcript. ' +
        'Capture: the user\'s goals, what was accomplished, key facts discovered, and any open threads. ' +
        'Be specific — include file names, commands, and decisions made. ' +
        'Write in the third person. Maximum 300 words.',
    };
    const userMsg = {
      role: 'user' as const,
      content: `Conversation transcript:\n\n${transcript}`,
    };

    logger.debug('summarising session', { sessionId, messages: messages.length, model });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [systemMsg, userMsg],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Summarisation API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const summary = data.choices[0]?.message?.content?.trim() ?? '';

    await this.updateMeta(sessionId, {
      summary,
      summaryUpTo: messages.length,
    });

    logger.debug('summarisation complete', { sessionId, summaryLength: summary.length });
    return summary;
  }

  // ─── History builder ──────────────────────────────────────────────────────

  /**
   * Build the history array for AgentRunner.stream().
   *
   * Layout:
   *   [0]    { role: 'system', content: systemPrompt }
   *   [1]    { role: 'system', content: 'Previous conversation summary: ...' }  ← if summary
   *   [2..N] Last windowSize messages from the JSONL (sliding window)
   *
   * Summarisation (if messages exist) is called automatically before building
   * the window, so the summary is always up to date.
   */
  async buildHistory(
    sessionId: string,
    systemPrompt: string,
    windowSize: number = DEFAULT_WINDOW_SIZE,
  ): Promise<CliHistoryMessage[]> {
    const history: CliHistoryMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    const messages = await this.readMessages(sessionId);
    if (messages.length === 0) return history;

    // Summarise all prior messages before building the window
    let summary: string;
    try {
      summary = await this.summarise(sessionId);
    } catch (err) {
      logger.warn('Summarisation failed — continuing without summary', {
        error: err instanceof Error ? err.message : String(err),
      });
      summary = '';
    }

    if (summary) {
      history.push({
        role: 'system',
        content: `Previous conversation summary:\n\n${summary}`,
      });
    }

    // Sliding window — last N messages
    const window = messages.slice(-windowSize);
    for (const m of window) {
      history.push({
        role: m.role,
        content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
        ...(m.toolName ? { toolName: m.toolName } : {}),
      });
    }

    return history;
  }
}
