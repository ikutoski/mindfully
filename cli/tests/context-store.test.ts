import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliContextStore, type CliMessage } from '../src/context-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessages(count: number, startSeq = 1): CliMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    seq: startSeq + i,
    role: (i % 2 === 0 ? 'user' : 'assistant') as CliMessage['role'],
    content: `message ${startSeq + i}`,
    createdAt: new Date().toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CliContextStore', () => {
  let tmpDir: string;
  let store: CliContextStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'ctx-store-test-'));
    store = new CliContextStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ─── Session management ──────────────────────────────────────────────────

  describe('createSession', () => {
    it('creates a session and returns valid metadata', async () => {
      const meta = await store.createSession();

      expect(meta.id).toBeTruthy();
      expect(meta.messageCount).toBe(0);
      expect(meta.summary).toBeUndefined();
      expect(new Date(meta.createdAt).getTime()).toBeGreaterThan(0);
    });

    it('persists the session to sessions.json', async () => {
      const meta = await store.createSession();
      const retrieved = await store.getSession(meta.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(meta.id);
    });

    it('does not create a JSONL file immediately', async () => {
      const { readFile } = await import('node:fs/promises');
      const meta = await store.createSession();

      await expect(
        readFile(path.join(tmpDir, `${meta.id}.jsonl`), 'utf-8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('creates multiple unique sessions', async () => {
      const a = await store.createSession();
      const b = await store.createSession();

      expect(a.id).not.toBe(b.id);
      const sessions = await store.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('getSession', () => {
    it('returns null for an unknown id', async () => {
      const result = await store.getSession('doesnotexist');
      expect(result).toBeNull();
    });

    it('returns the session for a known id', async () => {
      const meta = await store.createSession();
      const found = await store.getSession(meta.id);

      expect(found?.id).toBe(meta.id);
    });
  });

  describe('listSessions', () => {
    it('returns an empty array when no sessions exist', async () => {
      const sessions = await store.listSessions();
      expect(sessions).toEqual([]);
    });

    it('returns all sessions sorted by updatedAt descending', async () => {
      const a = await store.createSession();
      // Small delay so updatedAt timestamps differ
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.createSession();

      const sessions = await store.listSessions();
      expect(sessions[0]?.id).toBe(b.id);
      expect(sessions[1]?.id).toBe(a.id);
    });
  });

  // ─── Message I/O ─────────────────────────────────────────────────────────

  describe('appendMessages / readMessages', () => {
    it('round-trips messages correctly', async () => {
      const meta = await store.createSession();
      const msgs = makeMessages(3);

      await store.appendMessages(meta.id, msgs);
      const read = await store.readMessages(meta.id);

      expect(read).toHaveLength(3);
      expect(read[0]?.content).toBe('message 1');
      expect(read[1]?.content).toBe('message 2');
      expect(read[2]?.content).toBe('message 3');
    });

    it('appends incrementally — does not overwrite', async () => {
      const meta = await store.createSession();

      await store.appendMessages(meta.id, makeMessages(2, 1));
      await store.appendMessages(meta.id, makeMessages(2, 3));

      const read = await store.readMessages(meta.id);
      expect(read).toHaveLength(4);
    });

    it('returns empty array when no JSONL file exists', async () => {
      const meta = await store.createSession();
      const read = await store.readMessages(meta.id);
      expect(read).toEqual([]);
    });

    it('persists toolCalls, toolCallId, toolName fields', async () => {
      const meta = await store.createSession();
      const toolMsg: CliMessage = {
        seq: 1,
        role: 'tool',
        content: '{"result":"ok"}',
        toolCallId: 'call-1',
        toolName: 'read',
        createdAt: new Date().toISOString(),
      };

      await store.appendMessages(meta.id, [toolMsg]);
      const [read] = await store.readMessages(meta.id);

      expect(read?.toolCallId).toBe('call-1');
      expect(read?.toolName).toBe('read');
    });

    it('updates messageCount in sessions.json after append', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(5));

      const updated = await store.getSession(meta.id);
      expect(updated?.messageCount).toBe(5);
    });

    it('is a no-op when messages array is empty', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, []);

      const read = await store.readMessages(meta.id);
      expect(read).toHaveLength(0);
    });
  });

  // ─── buildHistory ────────────────────────────────────────────────────────

  describe('buildHistory', () => {
    it('returns only the system prompt when no prior messages exist', async () => {
      const meta = await store.createSession();
      const history = await store.buildHistory(meta.id, 'You are Mindful.');

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ role: 'system', content: 'You are Mindful.' });
    });

    it('includes the summary as a second system message when one exists', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(3));

      vi.spyOn(store, 'summarise').mockResolvedValue('User did X. Agent did Y.');

      const history = await store.buildHistory(meta.id, 'system prompt');

      expect(history[0]?.role).toBe('system');
      expect(history[0]?.content).toBe('system prompt');
      expect(history[1]?.role).toBe('system');
      expect(history[1]?.content).toContain('User did X. Agent did Y.');
    });

    it('includes prior messages in the sliding window after the summary', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(3));

      vi.spyOn(store, 'summarise').mockResolvedValue('summary text');

      const history = await store.buildHistory(meta.id, 'sys', 20);

      // system + summary + 3 messages
      expect(history).toHaveLength(5);
      expect(history[2]?.content).toBe('message 1');
      expect(history[4]?.content).toBe('message 3');
    });

    it('slices to the last windowSize messages', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(10));

      vi.spyOn(store, 'summarise').mockResolvedValue('summary');

      const history = await store.buildHistory(meta.id, 'sys', 3);

      // system + summary + 3 window messages
      expect(history).toHaveLength(5);
      const windowMessages = history.slice(2);
      expect(windowMessages[0]?.content).toBe('message 8');
      expect(windowMessages[2]?.content).toBe('message 10');
    });

    it('skips the summary message when summarise returns empty string', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(2));

      vi.spyOn(store, 'summarise').mockResolvedValue('');

      const history = await store.buildHistory(meta.id, 'sys');

      // No summary injected — system + 2 messages
      expect(history[1]?.role).toBe('user'); // first window message, not a system summary
    });

    it('continues without summary when summarise throws', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(2));

      vi.spyOn(store, 'summarise').mockRejectedValue(new Error('API down'));

      const history = await store.buildHistory(meta.id, 'sys');

      // Should not throw — just skips summary
      expect(history[0]?.role).toBe('system');
      // No extra system message for summary
      expect(history.filter((h) => h.role === 'system')).toHaveLength(1);
    });
  });

  // ─── summarise ───────────────────────────────────────────────────────────

  describe('summarise', () => {
    it('returns empty string and does not call API when no messages exist', async () => {
      const meta = await store.createSession();

      const fetchSpy = vi.spyOn(global, 'fetch');
      const result = await store.summarise(meta.id);

      expect(result).toBe('');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns empty string and does not call API when no API key is set', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(2));

      const origKey = process.env['OPENAI_API_KEY'];
      const origZenKey = process.env['OPENCODE_ZEN_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['OPENCODE_ZEN_API_KEY'];

      const fetchSpy = vi.spyOn(global, 'fetch');
      const result = await store.summarise(meta.id);

      process.env['OPENAI_API_KEY'] = origKey;
      if (origZenKey) process.env['OPENCODE_ZEN_API_KEY'] = origZenKey;

      expect(result).toBe('');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls OpenAI and writes summary to sessions.json', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(3));

      process.env['OPENAI_API_KEY'] = 'test-key';

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'User explored the codebase.' } }],
        }),
      } as Response);

      const summary = await store.summarise(meta.id);

      expect(summary).toBe('User explored the codebase.');

      const updated = await store.getSession(meta.id);
      expect(updated?.summary).toBe('User explored the codebase.');
      expect(updated?.summaryUpTo).toBe(3);

      delete process.env['OPENAI_API_KEY'];
    });

    it('throws when the API returns a non-ok response', async () => {
      const meta = await store.createSession();
      await store.appendMessages(meta.id, makeMessages(2));

      process.env['OPENAI_API_KEY'] = 'test-key';

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      } as Response);

      await expect(store.summarise(meta.id)).rejects.toThrow('429');

      delete process.env['OPENAI_API_KEY'];
    });
  });
});
