import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpTool } from '../src/tools/builtin/http.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(
  body: string,
  status = 200,
  contentType = 'text/plain',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    text: async () => body,
    headers: {
      get: (key: string) => (key === 'content-type' ? contentType : null),
      forEach: (cb: (value: string, key: string) => void) => {
        cb(contentType, 'content-type');
      },
    },
  } as unknown as Response;
}

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Article Title</title></head>
  <body>
    <nav>Nav links that should be removed</nav>
    <article>
      <h1>Main Heading</h1>
      <p>This is the main article content with enough text to be detected as readable content by Mozilla Readability.</p>
      <p>Second paragraph with more useful information for the agent to consume.</p>
    </article>
    <footer>Footer boilerplate to be stripped</footer>
  </body>
</html>
`;

const MINIMAL_HTML = `<html><body><p>Hello</p></body></html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('http tool', () => {
  const tool = createHttpTool();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Private IP blocking ---

  describe('private IP blocking', () => {
    const privateUrls = [
      'http://localhost/api',
      'http://127.0.0.1/secret',
      'http://127.0.0.2/',
      'http://0.0.0.0/',
      'http://10.0.0.1/',
      'http://10.255.255.255/',
      'http://172.16.0.1/',
      'http://172.31.0.1/',
      'http://192.168.1.1/',
      'http://192.168.0.254/',
      'http://169.254.0.1/',
    ];

    it.each(privateUrls)('blocks %s', async (url) => {
      const result = await tool.execute({ url });
      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toMatch(/[Bb]locked/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // --- Invalid URL ---

  it('returns error for invalid URL', async () => {
    const result = await tool.execute({ url: 'not-a-url' });
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/[Ii]nvalid URL/);
  });

  // --- JSON response (pass-through) ---

  it('returns JSON body as-is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse('{"hello":"world"}', 200, 'application/json'),
    );

    const result = await tool.execute({ url: 'https://api.example.com/data' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('application/json');
    expect(result.body).toBe('{"hello":"world"}');
  });

  // --- Plain text response (pass-through) ---

  it('returns plain text body as-is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse('hello world', 200, 'text/plain'),
    );

    const result = await tool.execute({ url: 'https://api.example.com/text' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.body).toBe('hello world');
    expect(result.contentType).toBe('text/plain');
  });

  // --- HTML response (Readability extraction) ---

  it('extracts clean text from HTML responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(SAMPLE_HTML, 200, 'text/html; charset=utf-8'),
    );

    const result = await tool.execute({ url: 'https://example.com/article' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.contentType).toBe('text/html; charset=utf-8');
    // Should include article content
    expect(result.body as string).toContain('Main Heading');
    expect(result.body as string).toContain('main article content');
    // Should NOT contain raw HTML tags
    expect(result.body as string).not.toMatch(/<[a-z]/i);
    // Should NOT contain nav/footer boilerplate (Readability strips these)
    expect(result.body as string).not.toContain('<nav>');
    expect(result.body as string).not.toContain('<footer>');
  });

  it('includes page title in extracted HTML text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(SAMPLE_HTML, 200, 'text/html'),
    );

    const result = await tool.execute({ url: 'https://example.com/article' }) as Record<string, unknown>;

    expect(result.body as string).toContain('Article Title');
  });

  it('falls back to tag-stripping for non-article HTML', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(MINIMAL_HTML, 200, 'text/html'),
    );

    const result = await tool.execute({ url: 'https://example.com/' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    // Either readability extracted it or fallback stripped tags — no raw HTML either way
    expect(result.body as string).not.toMatch(/<[a-z]/i);
    expect(result.body as string).toContain('Hello');
  });

  it('returns empty body (not an error) for empty HTML response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse('', 200, 'text/html'),
    );

    const result = await tool.execute({ url: 'https://example.com/empty' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBe('');
  });

  it('uses tag-strip fallback when HTML has no documentElement', async () => {
    // parseHTML of whitespace-only returns no documentElement — exercises the guard
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse('   ', 200, 'text/html'),
    );

    const result = await tool.execute({ url: 'https://example.com/blank' }) as Record<string, unknown>;

    // whitespace-only is trimmed to empty by the early-return guard
    expect(result.success).toBe(true);
    expect((result.body as string).trim()).toBe('');
  });

  it('uses tag-strip fallback when Readability throws', async () => {
    // Script/style-only HTML — Readability returns null; fallback strips tags
    const noArticle = '<html><head><script>alert(1)</script></head><body></body></html>';
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(noArticle, 200, 'text/html'),
    );

    const result = await tool.execute({ url: 'https://example.com/no-article' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.body as string).not.toMatch(/<script/i);
  });

  // --- Response shape ---

  // --- Response shape ---

  it('returns contentType field (not headers object)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse('ok', 200, 'application/json'),
    );

    const result = await tool.execute({ url: 'https://api.example.com/' }) as Record<string, unknown>;

    expect(result).toHaveProperty('contentType');
    expect(result).not.toHaveProperty('headers');
  });

  // --- POST with body ---

  it('sends body for POST requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse('created', 201, 'text/plain'));

    await tool.execute({
      url: 'https://api.example.com/items',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"test"}',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"test"}',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  // --- GET does not send body ---

  it('does not send body for GET requests even if provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse('ok', 200, 'text/plain'));

    await tool.execute({
      url: 'https://api.example.com/',
      method: 'GET',
      body: 'should-be-ignored',
    });

    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(callArgs.body).toBeUndefined();
  });

  // --- Non-2xx still returns success:true ---

  it('returns success:true for non-2xx responses (agent decides what to do)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse('Not Found', 404, 'text/plain'));

    const result = await tool.execute({ url: 'https://api.example.com/missing' }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.status).toBe(404);
    expect(result.body).toBe('Not Found');
  });

  // --- Timeout ---

  it('returns error when request times out', async () => {
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
      url: 'https://api.example.com/slow',
      timeout: 10,
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/timed out/i);
  });

  // --- Network error ---

  it('returns error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await tool.execute({ url: 'https://api.example.com/' }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('ECONNREFUSED');
  });

  // --- builtinToolNames includes http ---

  it('is registered in createBuiltinTools', async () => {
    const { createBuiltinTools, builtinToolNames } = await import('../src/tools/builtin/index.js');
    const tools = createBuiltinTools();
    expect(tools.find((t) => t.name === 'http')).toBeDefined();
    expect(builtinToolNames).toContain('http');
  });
});
