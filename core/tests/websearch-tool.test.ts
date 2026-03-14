import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebsearchTool } from '../src/tools/builtin/websearch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBraveResponse(results: Array<{ title: string; url: string; description: string }>) {
  return {
    web: { results },
  };
}

function makeJsonFetchResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    text: async () => text,
    json: async () => body,
  } as unknown as Response;
}

function makeTextFetchResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    text: async () => body,
    json: async () => { throw new Error('not JSON'); },
  } as unknown as Response;
}

const SAMPLE_RESULTS = [
  { title: 'Result One', url: 'https://example.com/1', description: 'Snippet one' },
  { title: 'Result Two', url: 'https://example.com/2', description: 'Snippet two' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('websearch tool', () => {
  const tool = createWebsearchTool();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Set a valid API key by default; individual tests can override
    process.env.BRAVE_API_KEY = 'test-brave-api-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BRAVE_API_KEY;
  });

  // --- Missing API key ---

  it('returns error when BRAVE_API_KEY is not set', async () => {
    delete process.env.BRAVE_API_KEY;

    const result = await tool.execute({ query: 'hello world' });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/BRAVE_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  // --- Successful search ---

  it('returns structured results on successful search', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse(SAMPLE_RESULTS)),
    );

    const result = await tool.execute({ query: 'TypeScript tips' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.query).toBe('TypeScript tips');

    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: 'Result One', url: 'https://example.com/1', snippet: 'Snippet one' });
    expect(results[1]).toEqual({ title: 'Result Two', url: 'https://example.com/2', snippet: 'Snippet two' });
  });

  // --- count and country query params ---

  it('passes count and country to the Brave Search URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse([])),
    );

    await tool.execute({ query: 'cats', count: 5, country: 'gb' });

    expect(fetch).toHaveBeenCalledOnce();
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=cats');
    expect(calledUrl).toContain('count=5');
    expect(calledUrl).toContain('country=gb');
  });

  // --- correct auth header ---

  it('sends X-Subscription-Token header with the API key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse([])),
    );

    await tool.execute({ query: 'test' });

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)['X-Subscription-Token']).toBe('test-brave-api-key');
  });

  // --- default count ---

  it('uses count=10 by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse([])),
    );

    await tool.execute({ query: 'defaults' });

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('count=10');
  });

  // --- country omitted when not provided ---

  it('does not include country param when not provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse([])),
    );

    await tool.execute({ query: 'no country' });

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('country=');
  });

  // --- empty results ---

  it('returns empty results array when Brave returns no hits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse([])),
    );

    const result = await tool.execute({ query: 'obscure query' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });

  // --- fetchContent: true —--

  it('fetches page content for each result when fetchContent is true', async () => {
    // First call: search API
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonFetchResponse(makeBraveResponse(SAMPLE_RESULTS)))
      // Second call: page 1
      .mockResolvedValueOnce(makeTextFetchResponse('<html><body><p>Page one content</p></body></html>'))
      // Third call: page 2
      .mockResolvedValueOnce(makeTextFetchResponse('<html><body><p>Page two content</p></body></html>'));

    const result = await tool.execute({ query: 'fetch me', fetchContent: true }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].content).toContain('Page one content');
    expect(results[1].content).toContain('Page two content');
    expect(fetch).toHaveBeenCalledTimes(3); // 1 search + 2 page fetches
  });

  // --- fetchContent: true with per-result failure ---

  it('sets content to null for results whose page fetch fails, others succeed', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonFetchResponse(makeBraveResponse(SAMPLE_RESULTS)))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')) // page 1 fails
      .mockResolvedValueOnce(makeTextFetchResponse('<p>Page two ok</p>')); // page 2 ok

    const result = await tool.execute({ query: 'partial fail', fetchContent: true }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].content).toBeNull();
    expect(results[1].content).toContain('Page two ok');
  });

  // --- fetchContent: false (default) — no extra fetches ---

  it('does not fetch page content when fetchContent is false (default)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonFetchResponse(makeBraveResponse(SAMPLE_RESULTS)),
    );

    const result = await tool.execute({ query: 'no fetch' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0]).not.toHaveProperty('content');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // --- HTML stripping ---

  it('strips HTML tags from fetched page content', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonFetchResponse(makeBraveResponse([SAMPLE_RESULTS[0]])))
      .mockResolvedValueOnce(
        makeTextFetchResponse(
          '<html><head><style>body{color:red}</style></head><body><h1>Title</h1><p>Plain text here.</p><script>alert(1)</script></body></html>',
        ),
      );

    const result = await tool.execute({ query: 'html strip', fetchContent: true }) as Record<string, unknown>;

    const content = (result.results as Array<Record<string, unknown>>)[0].content as string;
    expect(content).not.toContain('<');
    expect(content).not.toContain('<style');
    expect(content).not.toContain('<script');
    expect(content).toContain('Title');
    expect(content).toContain('Plain text here');
  });

  // --- content truncation ---

  it('truncates fetched content to 2000 chars', async () => {
    const longText = 'A'.repeat(5000);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonFetchResponse(makeBraveResponse([SAMPLE_RESULTS[0]])))
      .mockResolvedValueOnce(makeTextFetchResponse(longText));

    const result = await tool.execute({ query: 'long page', fetchContent: true }) as Record<string, unknown>;

    const content = (result.results as Array<Record<string, unknown>>)[0].content as string;
    // 2000 chars + ellipsis
    expect(content.length).toBeLessThanOrEqual(2001 + 3); // "…" is a multi-byte char but string length ≤ 2001+1
    expect(content).toContain('A');
  });

  // --- Search request timeout ---

  it('returns error when the search request times out', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal as AbortSignal;
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const result = await tool.execute({
      query: 'slow search',
      timeout: 10,
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/timed out/i);
  });

  // --- Brave API non-200 ---

  it('returns error when Brave API responds with non-200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeTextFetchResponse('Unauthorized', 401),
    );

    const result = await tool.execute({ query: 'unauthorized' }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/401/);
  });

  // --- Network error ---

  it('returns error on network failure during search', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('DNS lookup failed'));

    const result = await tool.execute({ query: 'network error' }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('DNS lookup failed');
  });

  // --- Registration ---

  it('is registered in createBuiltinTools and builtinToolNames', async () => {
    const { createBuiltinTools, builtinToolNames } = await import('../src/tools/builtin/index.js');
    const tools = createBuiltinTools();
    expect(tools.find((t) => t.name === 'websearch')).toBeDefined();
    expect(builtinToolNames).toContain('websearch');
  });
});
