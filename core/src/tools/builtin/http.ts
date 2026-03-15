import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { z } from 'zod';
import { tool, ToolRuntime } from "langchain";
import { createLogger } from '../../logger.js';

const logger = createLogger('core:http');

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // link-local
  /^fc[0-9a-f]{2}:/i,              // IPv6 ULA
  /^fe80:/i,                        // IPv6 link-local
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
}

/**
 * Extracts clean readable text from an HTML string using Mozilla Readability.
 * Falls back to stripping tags manually if the HTML is empty, unparseable,
 * or Readability cannot identify a main article.
 */
function extractTextFromHtml(html: string, url: string): string {
  if (!html.trim()) return '';

  const { document } = parseHTML(html);

  // Guard: linkedom returns no documentElement for pathological input
  if (!document.documentElement) {
    logger.warn('HTML extraction fallback: no documentElement', { url });
    return tagStripFallback(html);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new Readability(document as any, { charThreshold: 0 });
    const article = reader.parse();

    if (article) {
      logger.debug('Readability extraction succeeded', {
        url,
        title: article.title,
        extractedLength: article.textContent?.length ?? 0,
      });

      const parts: string[] = [];
      if (article.title) parts.push(`# ${article.title}`);
      if (article.byline) parts.push(`By ${article.byline}`);
      if (article.excerpt) parts.push(article.excerpt);
      if (article.textContent) {
        const cleaned = article.textContent
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        parts.push(cleaned);
      }
      return parts.join('\n\n');
    }

    logger.warn('Readability returned no article, using tag-strip fallback', { url });
    return tagStripFallback(html);
  } catch (err) {
    logger.warn('Readability threw during parse, using tag-strip fallback', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return tagStripFallback(html);
  }
}

function tagStripFallback(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isHtml(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/html');
}

const HttpSchema = z.object({
  url: z.string().describe('The URL to request'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
    .default('GET')
    .describe('HTTP method (default: GET)'),
  headers: z.record(z.string()).optional().describe('Request headers as key-value pairs'),
  body: z
    .string()
    .optional()
    .describe('Request body string (for POST / PUT / PATCH)'),
  timeout: z
    .number()
    .optional()
    .describe('Request timeout in milliseconds (default: 30000)'),
});

export type HttpInput = z.infer<typeof HttpSchema>;

export function createHttpTool() {
  return tool(
    async (args: HttpInput) => {
      // Validate & parse URL
      let parsed: URL;
      try {
        parsed = new URL(args.url);
      } catch {
        return JSON.stringify({ success: false, error: `Invalid URL: ${args.url}` });
      }

      // Block private IPs / localhost
      if (isPrivateHost(parsed.hostname)) {
        logger.warn('Blocked request to private/internal address', { hostname: parsed.hostname });
        return JSON.stringify({
          success: false,
          error: `Blocked: requests to private/internal addresses are not allowed (${parsed.hostname})`,
        });
      }

      const timeoutMs = args.timeout ?? 30_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      logger.debug('HTTP request', { method: args.method, url: args.url });

      try {
        const response = await fetch(args.url, {
          method: args.method,
          headers: args.headers as Record<string, string> | undefined,
          body:
            args.body !== undefined &&
            ['POST', 'PUT', 'PATCH'].includes(args.method)
              ? args.body
              : undefined,
          signal: controller.signal,
        });

        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') ?? '';

        let body: string;
        if (isHtml(contentType)) {
          logger.debug('HTML response — running Readability extraction', {
            url: args.url,
            status: response.status,
            rawLength: rawBody.length,
          });
          body = extractTextFromHtml(rawBody, args.url);
        } else {
          logger.debug('HTTP response', {
            url: args.url,
            status: response.status,
            contentType,
            bodyLength: rawBody.length,
          });
          body = rawBody;
        }

        return JSON.stringify({
          success: true,
          status: response.status,
          statusText: response.statusText,
          contentType,
          body,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          logger.warn('HTTP request timed out', { url: args.url, timeoutMs });
          return JSON.stringify({ success: false, error: `Request timed out after ${timeoutMs}ms` });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('HTTP request failed', { url: args.url, error: message });
        return JSON.stringify({ success: false, error: message });
      } finally {
        clearTimeout(timer);
      }
    },
    {
      name: 'http',
      description:
        'Make an HTTP request to a URL. Returns status code and response body. HTML responses are automatically converted to clean readable text using Mozilla Readability (boilerplate, ads, and navigation stripped). JSON and plain text are returned as-is. Private/internal IP addresses are blocked.',
      schema: HttpSchema,
    },
  );
}
