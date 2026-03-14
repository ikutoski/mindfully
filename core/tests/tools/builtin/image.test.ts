import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createImageTool, type VisionProvider } from '../../../src/tools/builtin/image.js';

// ---------------------------------------------------------------------------
// Mock vision provider
// ---------------------------------------------------------------------------

function makeMockProvider(response = 'mock analysis'): VisionProvider {
  return {
    analyze: vi.fn().mockResolvedValue(response),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('image tool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'image-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns error when no image provided', async () => {
    const tool = createImageTool(makeMockProvider());
    const result = await tool.execute({ prompt: 'describe this' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('image') });
  });

  it('analyzes a remote URL image', async () => {
    const provider = makeMockProvider('a red square');
    const tool = createImageTool(provider);

    const result = await tool.execute({
      prompt: 'what is this?',
      image: 'https://example.com/red.png',
    }) as { success: boolean; response: string; imagesAnalyzed: number };

    expect(result.success).toBe(true);
    expect(result.response).toBe('a red square');
    expect(result.imagesAnalyzed).toBe(1);
    expect(provider.analyze).toHaveBeenCalledOnce();

    // Verify the URL was passed through unchanged
    const [messages] = vi.mocked(provider.analyze).mock.calls[0];
    const urlPart = messages[0].content.find(
      (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
    );
    expect(urlPart?.image_url.url).toBe('https://example.com/red.png');
  });

  it('analyzes a local PNG file', async () => {
    // Write a minimal 1x1 red PNG (8 bytes payload doesn't matter — just a non-empty file)
    const imgPath = path.join(tmpDir, 'test.png');
    // Tiny valid-ish PNG bytes (header only is enough for base64 test)
    await writeFile(imgPath, Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]));

    const provider = makeMockProvider('a tiny image');
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'what is this?', image: imgPath },
      { workspaceDir: tmpDir },
    ) as { success: boolean; response: string };

    expect(result.success).toBe(true);
    expect(result.response).toBe('a tiny image');

    const [messages] = vi.mocked(provider.analyze).mock.calls[0];
    const urlPart = messages[0].content.find(
      (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
    );
    expect(urlPart?.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('resolves relative paths against workspaceDir', async () => {
    const imgPath = path.join(tmpDir, 'photo.jpg');
    await writeFile(imgPath, Buffer.from('fake-jpeg'));

    const provider = makeMockProvider('a photo');
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'describe', image: 'photo.jpg' },
      { workspaceDir: tmpDir },
    );

    expect(result).toMatchObject({ success: true });
    const [messages] = vi.mocked(provider.analyze).mock.calls[0];
    const urlPart = messages[0].content.find(
      (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
    );
    expect(urlPart?.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns error when file exceeds maxBytes', async () => {
    const imgPath = path.join(tmpDir, 'large.png');
    await writeFile(imgPath, Buffer.alloc(200)); // 200 bytes

    const provider = makeMockProvider();
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'analyze', image: imgPath, maxBytes: 100 },
      { workspaceDir: tmpDir },
    );

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('exceeds') });
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('returns error when local file does not exist', async () => {
    const provider = makeMockProvider();
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'analyze', image: '/no/such/file.png' },
      { workspaceDir: tmpDir },
    );

    expect(result).toMatchObject({ success: false });
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('analyzes multiple images via images array', async () => {
    const img1 = path.join(tmpDir, 'a.png');
    const img2 = path.join(tmpDir, 'b.png');
    await writeFile(img1, Buffer.from('img1'));
    await writeFile(img2, Buffer.from('img2'));

    const provider = makeMockProvider('two images');
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'compare these', images: [img1, img2] },
      { workspaceDir: tmpDir },
    ) as { success: boolean; imagesAnalyzed: number };

    expect(result.success).toBe(true);
    expect(result.imagesAnalyzed).toBe(2);

    const [messages] = vi.mocked(provider.analyze).mock.calls[0];
    const imageParts = messages[0].content.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
  });

  it('combines image and images when both provided', async () => {
    const img1 = path.join(tmpDir, 'c.png');
    const img2 = path.join(tmpDir, 'd.png');
    await writeFile(img1, Buffer.from('img1'));
    await writeFile(img2, Buffer.from('img2'));

    const provider = makeMockProvider('combo');
    const tool = createImageTool(provider);

    const result = await tool.execute(
      { prompt: 'analyze', image: img1, images: [img2] },
      { workspaceDir: tmpDir },
    ) as { success: boolean; imagesAnalyzed: number };

    expect(result.success).toBe(true);
    expect(result.imagesAnalyzed).toBe(2);
  });

  it('returns error when provider throws', async () => {
    const provider: VisionProvider = {
      analyze: vi.fn().mockRejectedValue(new Error('API unreachable')),
    };
    const tool = createImageTool(provider);

    const result = await tool.execute({
      prompt: 'analyze',
      image: 'https://example.com/img.png',
    });

    expect(result).toMatchObject({ success: false, error: 'API unreachable' });
  });

  it('uses provided model name', async () => {
    const provider = makeMockProvider('ok');
    const tool = createImageTool(provider);

    await tool.execute({
      prompt: 'analyze',
      image: 'https://example.com/x.png',
      model: 'gpt-4-turbo',
    });

    expect(provider.analyze).toHaveBeenCalledWith(
      expect.any(Array),
      'gpt-4-turbo',
    );
  });

  // ─── New feature tests ──────────────────────────────────────────────────────

  describe('data: URL support', () => {
    it('passes a valid data: URL through unchanged', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const provider = makeMockProvider('tiny png');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'what is this?', image: dataUrl },
        { workspaceDir: tmpDir },
      ) as { success: boolean; response: string };

      expect(result.success).toBe(true);
      expect(result.response).toBe('tiny png');

      const [messages] = vi.mocked(provider.analyze).mock.calls[0];
      const urlPart = messages[0].content.find(
        (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
      );
      expect(urlPart?.image_url.url).toBe(dataUrl);
    });

    it('returns error for invalid data: URL', async () => {
      const provider = makeMockProvider();
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'analyze', image: 'data:notvalid' },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: expect.stringContaining('data URL') });
      expect(provider.analyze).not.toHaveBeenCalled();
    });

    it('returns error for data: URL with non-image MIME type', async () => {
      const provider = makeMockProvider();
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'analyze', image: 'data:text/plain;base64,aGVsbG8=' },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: expect.stringContaining('text/plain') });
      expect(provider.analyze).not.toHaveBeenCalled();
    });
  });

  describe('file:// URL support', () => {
    it('resolves file:// URL as a local path', async () => {
      const imgPath = path.join(tmpDir, 'icon.png');
      await writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const provider = makeMockProvider('file url image');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'describe', image: `file://${imgPath}` },
        { workspaceDir: tmpDir },
      ) as { success: boolean };

      expect(result.success).toBe(true);

      const [messages] = vi.mocked(provider.analyze).mock.calls[0];
      const urlPart = messages[0].content.find(
        (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
      );
      expect(urlPart?.image_url.url).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('maxImages cap', () => {
    it('returns error when more images than maxImages are provided', async () => {
      const provider = makeMockProvider();
      const tool = createImageTool(provider);

      const result = await tool.execute(
        {
          prompt: 'analyze',
          images: [
            'https://example.com/a.png',
            'https://example.com/b.png',
            'https://example.com/c.png',
          ],
          maxImages: 2,
        },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Too many images'),
      });
      expect(provider.analyze).not.toHaveBeenCalled();
    });

    it('succeeds when image count equals maxImages', async () => {
      const provider = makeMockProvider('ok');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        {
          prompt: 'analyze',
          images: ['https://example.com/a.png', 'https://example.com/b.png'],
          maxImages: 2,
        },
        { workspaceDir: tmpDir },
      ) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('deduplicates identical image sources', async () => {
      const url = 'https://example.com/same.png';
      const provider = makeMockProvider('deduped');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'analyze', image: url, images: [url, url] },
        { workspaceDir: tmpDir },
      ) as { success: boolean; imagesAnalyzed: number };

      expect(result.success).toBe(true);
      // All three references collapse to one
      expect(result.imagesAnalyzed).toBe(1);

      const [messages] = vi.mocked(provider.analyze).mock.calls[0];
      const imageParts = messages[0].content.filter((p) => p.type === 'image_url');
      expect(imageParts).toHaveLength(1);
    });

    it('preserves order after deduplication', async () => {
      const url1 = 'https://example.com/first.png';
      const url2 = 'https://example.com/second.png';
      const provider = makeMockProvider('ordered');
      const tool = createImageTool(provider);

      await tool.execute(
        { prompt: 'compare', images: [url1, url2, url1] },
        { workspaceDir: tmpDir },
      );

      const [messages] = vi.mocked(provider.analyze).mock.calls[0];
      const imageParts = messages[0].content.filter(
        (p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url',
      );
      expect(imageParts).toHaveLength(2);
      expect(imageParts[0]?.image_url.url).toBe(url1);
      expect(imageParts[1]?.image_url.url).toBe(url2);
    });
  });

  describe('maxBytesMb', () => {
    it('rejects a local file exceeding maxBytesMb', async () => {
      const imgPath = path.join(tmpDir, 'big.png');
      await writeFile(imgPath, Buffer.alloc(600 * 1024)); // 600 KB

      const provider = makeMockProvider();
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'analyze', image: imgPath, maxBytesMb: 0.5 }, // 0.5 MB = 512 KB
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: expect.stringContaining('exceeds') });
      expect(provider.analyze).not.toHaveBeenCalled();
    });

    it('accepts a local file within maxBytesMb', async () => {
      const imgPath = path.join(tmpDir, 'small.png');
      await writeFile(imgPath, Buffer.alloc(100)); // 100 bytes

      const provider = makeMockProvider('small image');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        { prompt: 'analyze', image: imgPath, maxBytesMb: 1 }, // 1 MB limit
        { workspaceDir: tmpDir },
      ) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('legacy maxBytes takes precedence over maxBytesMb', async () => {
      const imgPath = path.join(tmpDir, 'medium.png');
      await writeFile(imgPath, Buffer.alloc(200));

      const provider = makeMockProvider();
      const tool = createImageTool(provider);

      // maxBytesMb=1 would allow it, but maxBytes=100 should reject
      const result = await tool.execute(
        { prompt: 'analyze', image: imgPath, maxBytes: 100, maxBytesMb: 1 },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: expect.stringContaining('exceeds') });
    });
  });

  describe('fallback models', () => {
    it('succeeds on fallback model when primary model fails', async () => {
      const provider: VisionProvider = {
        analyze: vi.fn()
          .mockRejectedValueOnce(new Error('primary model unavailable'))
          .mockResolvedValueOnce('fallback response'),
      };
      const tool = createImageTool(provider);

      const result = await tool.execute(
        {
          prompt: 'analyze',
          image: 'https://example.com/img.png',
          model: 'gpt-4o',
          fallbackModels: ['gpt-4-turbo'],
        },
        { workspaceDir: tmpDir },
      ) as { success: boolean; response: string; model: string };

      expect(result.success).toBe(true);
      expect(result.response).toBe('fallback response');
      expect(result.model).toBe('gpt-4-turbo');
    });

    it('returns error when all models (primary + fallbacks) fail', async () => {
      const provider: VisionProvider = {
        analyze: vi.fn()
          .mockRejectedValueOnce(new Error('primary fail'))
          .mockRejectedValueOnce(new Error('fallback fail')),
      };
      const tool = createImageTool(provider);

      const result = await tool.execute(
        {
          prompt: 'analyze',
          image: 'https://example.com/img.png',
          model: 'gpt-4o',
          fallbackModels: ['gpt-4-turbo'],
        },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: 'fallback fail' });
    });

    it('includes the model name that succeeded in the output', async () => {
      const provider = makeMockProvider('analysis result');
      const tool = createImageTool(provider);

      const result = await tool.execute(
        {
          prompt: 'analyze',
          image: 'https://example.com/img.png',
          model: 'gpt-4o',
        },
        { workspaceDir: tmpDir },
      ) as { success: boolean; model: string };

      expect(result.success).toBe(true);
      expect(result.model).toBe('gpt-4o');
    });
  });
});
