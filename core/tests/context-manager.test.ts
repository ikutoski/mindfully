import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from '../src/memory/context-manager.js';
import type { StoredMessage, SessionRecord } from '../src/memory/context-manager.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../src/logger.js', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock embedding provider so we don't need a real API key
vi.mock('../src/memory/embeddings.js', () => ({
  createEmbeddingProvider: () => ({
    dimensions: 1536,
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  }),
}));

// Mock QdrantClient
const mockSearch = vi.fn();
const mockUpsert = vi.fn();
const mockEnsureCollection = vi.fn();

vi.mock('../src/memory/qdrant.js', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    upsert: mockUpsert,
    ensureCollection: mockEnsureCollection,
  })),
}));

// Mock fetch for summarisation LLM call
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<StoredMessage> & { sequenceNumber: number; role: StoredMessage['role'] }): StoredMessage {
  const { sequenceNumber, role, content, ...rest } = overrides;
  return {
    id: `msg-${sequenceNumber}`,
    sessionId: 'session-1',
    sequenceNumber,
    role,
    content: content ?? `Message ${sequenceNumber}`,
    tokenCount: 10,
    createdAt: new Date(),
    ...rest,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    agentId: 'agent-1',
    summary: null,
    summaryUpTo: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureCollection.mockResolvedValue(undefined);
    mockUpsert.mockResolvedValue(undefined);
  });

  // ─── buildMessages ────────────────────────────────────────────────────────

  describe('buildMessages()', () => {
    it('returns empty array when no messages', async () => {
      const cm = new ContextManager({ qdrantUrl: undefined });
      const result = await cm.buildMessages(makeSession(), []);
      expect(result).toEqual([]);
    });

    it('applies sliding window — returns only last windowSize messages', async () => {
      const cm = new ContextManager({ windowSize: 3, qdrantUrl: undefined });
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage({ sequenceNumber: i + 1, role: i % 2 === 0 ? 'user' : 'assistant' }),
      );

      const result = await cm.buildMessages(makeSession(), messages);
      // Should contain the last 3 messages (seqs 8, 9, 10)
      const nonSystem = result.filter((m) => m.role !== 'system');
      expect(nonSystem).toHaveLength(3);
      expect(nonSystem[0].content).toBe('Message 8');
      expect(nonSystem[2].content).toBe('Message 10');
    });

    it('prepends summary as system message when session has summary', async () => {
      const cm = new ContextManager({ windowSize: 5, qdrantUrl: undefined });
      const messages = [makeMessage({ sequenceNumber: 1, role: 'user', content: 'Hello' })];
      const session = makeSession({ summary: 'Prior conversation about cats', summaryUpTo: 0 });

      const result = await cm.buildMessages(session, messages);
      const systemMsg = result.find((m) => m.role === 'system' && m.content.includes('Prior conversation about cats'));
      expect(systemMsg).toBeDefined();
    });

    it('preserves tool_calls on assistant messages', async () => {
      const cm = new ContextManager({ qdrantUrl: undefined });
      const msg = makeMessage({
        sequenceNumber: 1,
        role: 'assistant',
        content: '',
        toolCalls: [{ name: 'search', args: { q: 'test' } }],
      });

      const result = await cm.buildMessages(makeSession(), [msg]);
      const nonSystem = result.filter((m) => m.role !== 'system');
      expect(nonSystem[0].tool_calls).toEqual([{ name: 'search', args: { q: 'test' } }]);
    });

    it('prepends systemPrompt as first message before RAG and summary', async () => {
      const cm = new ContextManager({
        windowSize: 5,
        qdrantUrl: undefined,
        systemPrompt: 'You are a specialist agent.',
      });
      const messages = [makeMessage({ sequenceNumber: 1, role: 'user', content: 'Hello' })];
      const session = makeSession({ summary: 'Prior summary', summaryUpTo: 0 });

      const result = await cm.buildMessages(session, messages);

      expect(result[0]).toEqual({ role: 'system', content: 'You are a specialist agent.' });
      // Summary message should still exist further in the array
      const summaryMsg = result.find((m) => m.role === 'system' && m.content.includes('Prior summary'));
      expect(summaryMsg).toBeDefined();
    });

    it('does not inject a system prompt message when systemPrompt is not set', async () => {
      const cm = new ContextManager({ windowSize: 5, qdrantUrl: undefined });
      const messages = [makeMessage({ sequenceNumber: 1, role: 'user', content: 'Hello' })];

      const result = await cm.buildMessages(makeSession(), messages);

      // Without a summary or RAG, there should be no system messages at all
      const systemMessages = result.filter((m) => m.role === 'system');
      expect(systemMessages).toHaveLength(0);
    });
  });

  // ─── maybeSummarise ───────────────────────────────────────────────────────

  describe('maybeSummarise()', () => {
    it('returns null when no openaiApiKey', async () => {
      const cm = new ContextManager({ openaiApiKey: undefined, qdrantUrl: undefined });
      // Force no env key
      const orig = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const messages = Array.from({ length: 50 }, (_, i) =>
        makeMessage({ sequenceNumber: i + 1, role: 'user' }),
      );
      const result = await cm.maybeSummarise(makeSession(), messages);
      expect(result).toBeNull();

      if (orig !== undefined) process.env.OPENAI_API_KEY = orig;
    });

    it('returns null when messages do not exceed summariseThreshold', async () => {
      const cm = new ContextManager({
        openaiApiKey: 'sk-test',
        summariseThreshold: 40,
        qdrantUrl: undefined,
      });
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeMessage({ sequenceNumber: i + 1, role: 'user' }),
      );
      const result = await cm.maybeSummarise(makeSession(), messages);
      expect(result).toBeNull();
    });

    it('calls OpenAI and returns summary when threshold exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Generated summary' } }],
        }),
      });

      const cm = new ContextManager({
        openaiApiKey: 'sk-test',
        summariseThreshold: 10,
        qdrantUrl: undefined,
      });
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeMessage({ sequenceNumber: i + 1, role: 'user' }),
      );

      const result = await cm.maybeSummarise(makeSession(), messages);
      expect(result).not.toBeNull();
      expect(result?.summary).toBe('Generated summary');
      expect(typeof result?.summaryUpTo).toBe('number');
    });

    it('returns null when OpenAI call fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const cm = new ContextManager({
        openaiApiKey: 'sk-test',
        summariseThreshold: 10,
        qdrantUrl: undefined,
      });
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeMessage({ sequenceNumber: i + 1, role: 'user' }),
      );

      const result = await cm.maybeSummarise(makeSession(), messages);
      expect(result).toBeNull();
    });
  });

  // ─── upsertMessages ───────────────────────────────────────────────────────

  describe('upsertMessages()', () => {
    it('is a no-op when no qdrantClient configured', async () => {
      const cm = new ContextManager({ qdrantUrl: undefined });
      const msg = makeMessage({ sequenceNumber: 1, role: 'user' });
      await expect(cm.upsertMessages('agent-1', [msg])).resolves.toBeUndefined();
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('calls qdrant upsert when qdrantClient is configured', async () => {
      const cm = new ContextManager({ qdrantUrl: 'http://localhost:6333', qdrantApiKey: undefined });
      const msg = makeMessage({ sequenceNumber: 1, role: 'user', content: 'Hello world' });
      await cm.upsertMessages('agent-1', [msg]);
      expect(mockUpsert).toHaveBeenCalledOnce();
    });
  });

  // ─── ragQuery ─────────────────────────────────────────────────────────────

  describe('ragQuery()', () => {
    it('returns empty array when no qdrantClient', async () => {
      const cm = new ContextManager({ qdrantUrl: undefined });
      const result = await cm.ragQuery('agent-1', 'session-1', 'query text');
      expect(result).toEqual([]);
    });

    it('returns cross-session context messages when Qdrant returns results', async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: 'other-msg-1',
          score: 0.9,
          payload: { role: 'user', content: 'Past relevant message', sessionId: 'other-session' },
        },
      ]);

      const cm = new ContextManager({ qdrantUrl: 'http://localhost:6333' });
      const result = await cm.ragQuery('agent-1', 'current-session', 'query text');

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('Past relevant message');
    });

    it('returns empty array when Qdrant search throws', async () => {
      mockSearch.mockRejectedValueOnce(new Error('Qdrant unavailable'));

      const cm = new ContextManager({ qdrantUrl: 'http://localhost:6333' });
      const result = await cm.ragQuery('agent-1', 'session-1', 'query text');
      expect(result).toEqual([]);
    });
  });
});
