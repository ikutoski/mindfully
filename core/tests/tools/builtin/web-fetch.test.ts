import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebFetchTool } from '../../../src/tools/builtin/web-fetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  body: string,
  options: { status?: number; contentType?: string } = {},
): Response {
  const status = options.status ?? 200;
  const contentType = options.contentType ?? 'text/html; charset=utf-8';
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

const SIMPLE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Test Article</title></head>
  <body>
    <article>
      <h1>Hello World</h1>
      <p>This is the article body with enough text to pass Readability thresholds.
      Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.</p>
    </article>
  </body>
</html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('web_fetch tool', () => {
  const tool = createWebFetchTool();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Blocked hosts
  // -------------------------------------------------------------------------

  it('blocks localhost', async () => {
    const result = await tool.execute({ url: 'http://localhost/api' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Blocked') });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('blocks 127.x.x.x', async () => {
    const result = await tool.execute({ url: 'http://127.0.0.1:8080/' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Blocked') });
  });

  it('blocks 10.x.x.x', async () => {
    const result = await tool.execute({ url: 'http://10.0.0.1/' });
    expect(result).toMatchObject({ success: false });
  });

  it('blocks 192.168.x.x', async () => {
    const result = await tool.execute({ url: 'http://192.168.1.100/' });
    expect(result).toMatchObject({ success: false });
  });

  // -------------------------------------------------------------------------
  // Invalid URL
  // -------------------------------------------------------------------------

  it('throws ZodError for invalid URL (Zod validates before execute)', async () => {
    // The tool's inputSchema uses z.string().url(), so Zod throws before execute() runs
    await expect(tool.execute({ url: 'not-a-url' })).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // HTTP error responses
  // -------------------------------------------------------------------------

  it('returns error on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('Not Found', { status: 404 }));
    const result = await tool.execute({ url: 'https://example.com/missing' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('404') });
  });

  // -------------------------------------------------------------------------
  // Non-HTML responses (JSON, plain text)
  // -------------------------------------------------------------------------

  it('returns JSON body as-is', async () => {
    const json = JSON.stringify({ hello: 'world' });
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(json, { contentType: 'application/json' }),
    );
    const result = await tool.execute({ url: 'https://api.example.com/data' }) as {
      success: boolean; content: string;
    };
    expect(result.success).toBe(true);
    expect(result.content).toBe(json);
  });

  it('returns plain text body as-is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse('hello world', { contentType: 'text/plain' }),
    );
    const result = await tool.execute({ url: 'https://example.com/file.txt' }) as {
      success: boolean; content: string;
    };
    expect(result.success).toBe(true);
    expect(result.content).toBe('hello world');
  });

  // -------------------------------------------------------------------------
  // HTML → markdown extraction
  // -------------------------------------------------------------------------

  it('extracts markdown from HTML by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(SIMPLE_HTML));
    const result = await tool.execute({ url: 'https://example.com/article' }) as {
      success: boolean; content: string; extractMode: string;
    };
    expect(result.success).toBe(true);
    expect(result.extractMode).toBe('markdown');
    // Readability or tag-strip fallback — either way we get some content
    expect(result.content.length).toBeGreaterThan(0);
    // Should contain the article text
    expect(result.content).toMatch(/Hello World|hello world|article/i);
  });

  it('extracts plain text when extractMode=text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(SIMPLE_HTML));
    const result = await tool.execute({
      url: 'https://example.com/article',
      extractMode: 'text',
    }) as { success: boolean; content: string; extractMode: string };
    expect(result.success).toBe(true);
    expect(result.extractMode).toBe('text');
    // No markdown headings (# prefix) expected in text mode
    expect(result.content).not.toMatch(/^#\s/m);
  });

  // -------------------------------------------------------------------------
  // Truncation
  // -------------------------------------------------------------------------

  it('truncates content to maxChars', async () => {
    const longText = 'a'.repeat(5000);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(longText, { contentType: 'text/plain' }),
    );
    const result = await tool.execute({
      url: 'https://example.com/long',
      maxChars: 100,
    }) as { success: boolean; content: string; truncated: boolean };
    expect(result.success).toBe(true);
    expect(result.content.length).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it('does not set truncated=true when content fits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse('short', { contentType: 'text/plain' }),
    );
    const result = await tool.execute({ url: 'https://example.com/short' }) as {
      success: boolean; truncated: boolean;
    };
    expect(result.success).toBe(true);
    expect(result.truncated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Fetch network error
  // -------------------------------------------------------------------------

  it('returns error when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));
    const result = await tool.execute({ url: 'https://example.com/' });
    expect(result).toMatchObject({ success: false, error: 'Network failure' });
  });

  // -------------------------------------------------------------------------
  // Response metadata
  // -------------------------------------------------------------------------

  it('includes url and extractMode in success response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse('ok', { contentType: 'text/plain' }),
    );
    const result = await tool.execute({
      url: 'https://example.com/test',
      extractMode: 'text',
    }) as { success: boolean; url: string; extractMode: string };
    expect(result.url).toBe('https://example.com/test');
    expect(result.extractMode).toBe('text');
  });

  // -------------------------------------------------------------------------
  // Malformed HTML fallback
  // -------------------------------------------------------------------------

  it('handles malformed HTML gracefully', async () => {
    const malformed = '<html><body><b>Unclosed tag <p>Some content</body>';
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(malformed));
    const result = await tool.execute({ url: 'https://example.com/malformed' });
    expect(result).toMatchObject({ success: true });
    const r = result as { content: string };
    expect(r.content.length).toBeGreaterThan(0);
  });
});
