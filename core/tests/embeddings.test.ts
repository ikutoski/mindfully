import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmbeddingProvider } from '../src/memory/embeddings.js';

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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_MODEL;
  });

  describe('without API key', () => {
    it('returns a zero-vector provider when no API key is set', async () => {
      const provider = createEmbeddingProvider(undefined);

      expect(provider.dimensions).toBe(1536);
      const vec = await provider.embed('hello');
      expect(vec).toHaveLength(1536);
      expect(vec.every((v: number) => v === 0)).toBe(true);
    });

    it('does not call fetch when no API key', async () => {
      const provider = createEmbeddingProvider(undefined);
      await provider.embed('hello');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('with API key', () => {
    const fakeKey = 'sk-test-key';
    const fakeEmbedding = Array.from({ length: 1536 }, (_: unknown, i: number) => i / 1536);

    it('calls the OpenAI embeddings API and returns the embedding', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
      });

      const provider = createEmbeddingProvider(fakeKey);
      const vec = await provider.embed('test text');

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${fakeKey}`,
          }),
        }),
      );
      expect(vec).toEqual(fakeEmbedding);
    });

    it('falls back to zero-vector when API call fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = createEmbeddingProvider(fakeKey);
      const vec = await provider.embed('test text');

      expect(vec).toHaveLength(1536);
      expect(vec.every((v: number) => v === 0)).toBe(true);
    });

    it('falls back to zero-vector when API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const provider = createEmbeddingProvider(fakeKey);
      const vec = await provider.embed('test text');

      expect(vec).toHaveLength(1536);
      expect(vec.every((v: number) => v === 0)).toBe(true);
    });

    it('uses EMBEDDING_MODEL env var when set', async () => {
      process.env.EMBEDDING_MODEL = 'text-embedding-ada-002';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
      });

      const provider = createEmbeddingProvider(fakeKey);
      await provider.embed('test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(callBody.model).toBe('text-embedding-ada-002');
    });

    it('exposes dimensions = 1536', () => {
      const provider = createEmbeddingProvider(fakeKey);
      expect(provider.dimensions).toBe(1536);
    });
  });
});
