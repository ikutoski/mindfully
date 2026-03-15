import { z } from 'zod';
import { tool, ToolRuntime } from "langchain";
import { createLogger } from '../../logger.js';

const logger = createLogger('core:websearch');

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const CONTENT_TRUNCATE_CHARS = 2000;

const WebsearchSchema = z.object({
  query: z.string().describe('The search query'),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Number of results to return (1–20, default: 10)'),
  country: z
    .string()
    .optional()
    .describe('Country code for localised results (e.g. "us", "gb")'),
  fetchContent: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, fetch and return the full page text for each result'),
  timeout: z
    .number()
    .optional()
    .describe('Request timeout in milliseconds (default: 30000)'),
});

export type WebsearchInput = z.infer<typeof WebsearchSchema>;

export interface WebsearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string | null;
}

/** Strip HTML tags and collapse whitespace to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Fetch a URL and return plain text, truncated to CONTENT_TRUNCATE_CHARS. Returns null on any error. */
async function fetchPageContent(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const html = await response.text();
    const text = stripHtml(html);
    return text.length > CONTENT_TRUNCATE_CHARS
      ? text.slice(0, CONTENT_TRUNCATE_CHARS) + '…'
      : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export function createWebsearchTool() {
  return tool(
    async (args: WebsearchInput) => {
      const apiKey = process.env.BRAVE_API_KEY;
      if (!apiKey) {
        logger.warn('BRAVE_API_KEY is not configured');
        return JSON.stringify({ success: false, error: 'BRAVE_API_KEY is not configured' });
      }

      const timeoutMs = args.timeout ?? 30_000;

      // Build search URL
      const searchUrl = new URL(BRAVE_SEARCH_URL);
      searchUrl.searchParams.set('q', args.query);
      searchUrl.searchParams.set('count', String(args.count ?? 10));
      if (args.country) {
        searchUrl.searchParams.set('country', args.country);
      }

      // Execute search request
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      logger.debug('Brave search request', { query: args.query, count: args.count ?? 10 });

      let braveData: BraveSearchResponse;
      try {
        const response = await fetch(searchUrl.toString(), {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': apiKey,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          logger.warn('Brave Search API error', { status: response.status, body: errorBody });
          return JSON.stringify({
            success: false,
            error: `Brave Search API returned ${response.status} ${response.statusText}${errorBody ? ': ' + errorBody : ''}`,
          });
        }

        braveData = (await response.json()) as BraveSearchResponse;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          logger.warn('Search request timed out', { query: args.query, timeoutMs });
          return JSON.stringify({ success: false, error: `Search request timed out after ${timeoutMs}ms` });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Search request failed', { query: args.query, error: message });
        return JSON.stringify({
          success: false,
          error: message,
        });
      } finally {
        clearTimeout(timer);
      }

      // Map Brave results
      const rawResults: BraveWebResult[] = braveData?.web?.results ?? [];
      const results: WebsearchResult[] = rawResults.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: stripHtml(r.description ?? ''),
      }));

      logger.debug('Brave search results', { query: args.query, resultCount: results.length });

      // Optionally fetch page content for each result
      if (args.fetchContent) {
        logger.debug('Fetching full page content for results', { count: results.length });
        const contentTimeout = Math.min(timeoutMs, 10_000); // cap per-page timeout at 10s
        await Promise.all(
          results.map(async (result) => {
            result.content = await fetchPageContent(result.url, contentTimeout);
          }),
        );
      }

      return JSON.stringify({
        success: true,
        query: args.query,
        results,
      });
    },
    {
      name: 'websearch',
      description:
        'Search the web using Brave Search and return a list of results with title, URL, and snippet. ' +
        'Optionally fetch the full page content for each result. Requires BRAVE_API_KEY.',
      schema: WebsearchSchema,
    },
  );
}
