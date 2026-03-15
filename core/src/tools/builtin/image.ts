import { z } from 'zod';
import { tool, ToolRuntime } from "langchain";
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '../../logger.js';

const logger = createLogger('core:image');

// ---------------------------------------------------------------------------
// VisionProvider interface — inject for testing / alternative providers
// ---------------------------------------------------------------------------

export interface VisionMessage {
  role: 'user';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface VisionProvider {
  analyze(messages: VisionMessage[], model?: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Default provider — OpenAI-compatible chat completions API
// ---------------------------------------------------------------------------

function getApiKey(): string | undefined {
  return process.env.OPENCODE_ZEN_API_KEY ?? process.env.OPENAI_API_KEY;
}

function getBaseUrl(): string {
  return process.env.OPENCODE_ZEN_BASE_URL ?? 'https://api.openai.com/v1';
}

class DefaultVisionProvider implements VisionProvider {
  async analyze(messages: VisionMessage[], model = 'gpt-4o'): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        'No API key found. Set OPENCODE_ZEN_API_KEY or OPENAI_API_KEY environment variable.',
      );
    }

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Vision API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? '';
  }
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES_MB = 5; // 5 MB
const DEFAULT_MAX_IMAGES = 20;

const ImageSchema = z.object({
  prompt: z.string().describe('The question or instruction for the vision model'),
  image: z
    .string()
    .optional()
    .describe(
      'A single image: a file path (absolute or relative), a file:// URL, a data: URL, or an https:// URL',
    ),
  images: z
    .array(z.string())
    .optional()
    .describe(
      'Multiple images: file paths, file:// URLs, data: URLs, or https:// URLs. Combined with `image` if both provided.',
    ),
  model: z
    .string()
    .optional()
    .describe('Vision model to use (default: gpt-4o)'),
  fallbackModels: z
    .array(z.string())
    .optional()
    .describe('Fallback model names to try if the primary model fails, in order'),
  maxBytesMb: z
    .number()
    .positive()
    .optional()
    .describe(`Maximum megabytes per local image file before rejecting (default: ${DEFAULT_MAX_BYTES_MB})`),
  maxImages: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Maximum number of images to process in a single call (default: ${DEFAULT_MAX_IMAGES})`),
  // Legacy field — kept for backwards compatibility, takes precedence over maxBytesMb if set
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum bytes per local image file (legacy — prefer maxBytesMb)'),
});

type ImageInput = z.infer<typeof ImageSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates a data: URL, ensuring it has an image MIME type and non-empty base64 payload.
 * Returns the source unchanged (it is already a valid image_url value).
 */
function parseDataUrl(source: string): string {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(source.trim());
  if (!match) {
    throw new Error('Invalid data URL: expected format data:<mime>;base64,<data>');
  }
  const mimeType = (match[1] ?? '').trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported data URL type: ${mimeType}`);
  }
  if ((match[2] ?? '').trim().length === 0) {
    throw new Error('Invalid data URL: empty payload');
  }
  return source;
}

async function loadImageAsDataUrl(
  source: string,
  maxBytes: number,
  workspaceDir: string,
): Promise<string> {
  // data: URL — validate and pass through
  if (/^data:/i.test(source)) {
    return parseDataUrl(source);
  }

  // Remote URL — pass through directly
  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  // Local file — read and base64-encode
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  // Strip file:// prefix if present
  const localPath = /^file:\/\//i.test(source) ? source.slice('file://'.length) : source;

  const resolved = path.isAbsolute(localPath)
    ? localPath
    : path.resolve(workspaceDir, localPath);

  const buffer = await readFile(resolved);
  if (buffer.byteLength > maxBytes) {
    throw new Error(
      `Image "${source}" is ${buffer.byteLength} bytes, exceeds maxBytes limit of ${maxBytes}`,
    );
  }

  // Detect MIME type from extension
  const ext = path.extname(resolved).toLowerCase().slice(1);
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  };
  const mime = mimeMap[ext] ?? 'image/jpeg';

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createImageTool(provider?: VisionProvider) {
  const visionProvider = provider ?? new DefaultVisionProvider();

  return tool(
    async (args: ImageInput, config?: RunnableConfig) => {
      const workspaceDir =
        (config?.configurable as Record<string, unknown> | undefined)?.['workspaceDir'] as string | undefined
        ?? process.cwd();

      // Resolve byte limit — legacy maxBytes takes precedence over maxBytesMb
      const maxBytes = args.maxBytes ?? (args.maxBytesMb ?? DEFAULT_MAX_BYTES_MB) * 1024 * 1024;

      const maxImages = args.maxImages ?? DEFAULT_MAX_IMAGES;
      const model = args.model ?? 'gpt-4o';
      const fallbackModels = args.fallbackModels ?? [];

      // Collect + deduplicate image sources (preserve order)
      const seen = new Set<string>();
      const sources: string[] = [];
      for (const src of [
        ...(args.image ? [args.image] : []),
        ...(args.images ?? []),
      ]) {
        const key = src.trim();
        if (!seen.has(key)) {
          seen.add(key);
          sources.push(src);
        }
      }

      if (sources.length === 0) {
        return JSON.stringify({ success: false, error: 'At least one image must be provided via "image" or "images"' });
      }

      // Enforce maxImages cap
      if (sources.length > maxImages) {
        return JSON.stringify({
          success: false,
          error: `Too many images: ${sources.length} provided but maxImages is ${maxImages}`,
        });
      }

      logger.debug('image analyze', { sources: sources.length, model, prompt: args.prompt });

      // Build content parts
      const parts: VisionMessage['content'] = [
        { type: 'text', text: args.prompt },
      ];

      for (const src of sources) {
        let url: string;
        try {
          url = await loadImageAsDataUrl(src, maxBytes, workspaceDir);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn('image load error', { src, error: message });
          return JSON.stringify({ success: false, error: message });
        }
        parts.push({ type: 'image_url', image_url: { url } });
      }

      const messages: VisionMessage[] = [{ role: 'user', content: parts }];

      // Try primary model then fallbacks in order
      const modelsToTry = [model, ...fallbackModels];
      let lastError = 'Unknown error';

      for (const candidateModel of modelsToTry) {
        try {
          const response = await visionProvider.analyze(messages, candidateModel);
          logger.debug('image analyze complete', { responseLength: response.length, model: candidateModel });
          return JSON.stringify({
            success: true,
            response,
            imagesAnalyzed: sources.length,
            model: candidateModel,
          });
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          logger.warn('image analyze error', { model: candidateModel, error: lastError });
        }
      }

      return JSON.stringify({ success: false, error: lastError });
    },
    {
      name: 'image',
      description:
        'Analyze one or more images using a vision model. ' +
        'Accepts local file paths (absolute or relative to workspaceDir), file:// URLs, ' +
        'data: URLs (base64-encoded), and remote https:// URLs. ' +
        'Returns the model\'s textual response to the given prompt.',
      schema: ImageSchema,
    },
  );
}
