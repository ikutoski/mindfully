import { z } from 'zod';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { tool, ToolRuntime } from "langchain";
import { createLogger } from '../../logger.js';

const logger = createLogger('core:web-fetch');

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(hostname));
}

const WebFetchSchema = z.object({
  url: z.string().url().describe('The URL to fetch and extract content from'),
  extractMode: z
    .enum(['markdown', 'text'])
    .optional()
    .describe('Output format: "markdown" (default) or "text"'),
  maxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum characters to return. Default 20000.'),
});

type WebFetchInput = z.infer<typeof WebFetchSchema>;

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export function createWebFetchTool() {
  return tool(
    async (args: WebFetchInput) => {
      const extractMode = args.extractMode ?? 'markdown';
      const maxChars = args.maxChars ?? 20000;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(args.url);
      } catch {
        return JSON.stringify({ success: false, error: `Invalid URL: ${args.url}` });
      }

      if (isBlockedHost(parsedUrl.hostname)) {
        return JSON.stringify({ success: false, error: `Blocked: private/internal address "${parsedUrl.hostname}"` });
      }

      logger.debug('web_fetch', { url: args.url, extractMode, maxChars });

      let rawHtml: string;
      let contentType: string;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let response: Response;
        try {
          response = await fetch(args.url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mindful-agent/0.1.5)' },
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          return JSON.stringify({ success: false, error: `HTTP ${response.status}: ${response.statusText}` });
        }

        contentType = response.headers.get('content-type') ?? '';
        rawHtml = await response.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('web_fetch fetch error', { url: args.url, error: message });
        return JSON.stringify({ success: false, error: message });
      }

      let content: string;

      // Non-HTML: return as-is (JSON, plain text, etc.)
      if (!contentType.includes('html')) {
        content = rawHtml;
      } else {
        // Parse with linkedom + Readability
        try {
          const { document } = parseHTML(rawHtml);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const reader = new Readability(document as any);
          const article = reader.parse();

          if (article) {
            content =
              extractMode === 'markdown'
                ? turndown.turndown(article.content ?? '')
                : String(article.textContent ?? article.content).replace(/\s{2,}/g, ' ').trim();
          } else {
            // Readability failed — strip all tags
            content = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn('web_fetch parse error', { url: args.url, error: message });
          content = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        }
      }

      const truncated = content.length > maxChars;
      if (truncated) content = content.slice(0, maxChars);

      logger.debug('web_fetch complete', {
        url: args.url,
        contentLength: content.length,
        truncated,
      });

      return JSON.stringify({
        success: true,
        url: args.url,
        content,
        extractMode,
        truncated,
      });
    },
    {
      name: 'web_fetch',
      description:
        'Fetch a URL and return its readable content as clean markdown or plain text. ' +
        'Strips navigation, ads, and boilerplate using Mozilla Readability. ' +
        'Use this for reading articles, documentation, or any web page. ' +
        'Private/internal IP addresses are blocked.',
      schema: WebFetchSchema,
    },
  );
}
