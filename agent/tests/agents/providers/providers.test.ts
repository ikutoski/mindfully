/**
 * Tests for the new LangChain provider factory (providers/index.ts).
 *
 * We test:
 *  - CostCallbackHandler accumulation and totals
 *  - createChatModel throws on missing API keys
 *  - createLLMChain builds a runnable chain
 *  - Helper functions (getProviderModels, getAllProviderNames)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CostCallbackHandler,
  createChatModel,
  createLLMChain,
  getProviderModels,
  getAllProviderNames,
  PROVIDER_MODELS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
} from '../../../src/agents/providers/index.js';
import type { LLMResult } from '@langchain/core/outputs';

// ─── CostCallbackHandler ──────────────────────────────────────────────────────

describe('CostCallbackHandler', () => {
  it('starts with empty history and zero total cost', () => {
    const handler = new CostCallbackHandler('openai', 'gpt-4o');
    expect(handler.getCostHistory()).toHaveLength(0);
    expect(handler.getTotalCost()).toBe(0);
    expect(handler.getLastEntry()).toBeUndefined();
  });

  it('accumulates cost after handleLLMEnd with tokenUsage', async () => {
    const handler = new CostCallbackHandler('openai', 'gpt-4o');
    const output: LLMResult = {
      generations: [],
      llmOutput: {
        tokenUsage: { promptTokens: 1000, completionTokens: 500 },
      },
    };
    await handler.handleLLMEnd(output);

    const history = handler.getCostHistory();
    expect(history).toHaveLength(1);
    expect(history[0].provider).toBe('openai');
    expect(history[0].model).toBe('gpt-4o');
    expect(history[0].inputTokens).toBe(1000);
    expect(history[0].outputTokens).toBe(500);
    expect(history[0].totalCost).toBeGreaterThan(0);
    expect(history[0].currency).toBe('USD');
  });

  it('accumulates multiple entries', async () => {
    const handler = new CostCallbackHandler('anthropic', 'claude-sonnet-4-20241022');
    const usage = {
      generations: [],
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
    };
    await handler.handleLLMEnd(usage);
    await handler.handleLLMEnd(usage);

    expect(handler.getCostHistory()).toHaveLength(2);
    expect(handler.getTotalCost()).toBeGreaterThan(0);
  });

  it('does nothing when llmOutput has no tokenUsage', async () => {
    const handler = new CostCallbackHandler('openai', 'gpt-4o');
    await handler.handleLLMEnd({ generations: [], llmOutput: {} });
    expect(handler.getCostHistory()).toHaveLength(0);
  });

  it('does nothing when llmOutput is undefined', async () => {
    const handler = new CostCallbackHandler('openai', 'gpt-4o');
    await handler.handleLLMEnd({ generations: [] });
    expect(handler.getCostHistory()).toHaveLength(0);
  });

  it('getLastEntry returns the most recent entry', async () => {
    const handler = new CostCallbackHandler('openai', 'gpt-4o-mini');
    const usage = {
      generations: [],
      llmOutput: { tokenUsage: { promptTokens: 10, completionTokens: 5 } },
    };
    await handler.handleLLMEnd(usage);
    await handler.handleLLMEnd({
      generations: [],
      llmOutput: { tokenUsage: { promptTokens: 20, completionTokens: 10 } },
    });

    const last = handler.getLastEntry();
    expect(last?.inputTokens).toBe(20);
  });
});

// ─── createChatModel ──────────────────────────────────────────────────────────

describe('createChatModel', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Restore clean env before each test
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  it('throws when OPENCODE_ZEN_API_KEY is missing', () => {
    delete process.env.OPENCODE_ZEN_API_KEY;
    expect(() =>
      createChatModel('opencode-zen', { model: 'gpt-5.1-codex', temperature: 0.7, maxTokens: 1024 }),
    ).toThrow('OPENCODE_ZEN_API_KEY is required');
  });

  it('throws when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() =>
      createChatModel('openai', { model: 'gpt-4o', temperature: 0.7, maxTokens: 1024 }),
    ).toThrow('OPENAI_API_KEY is required');
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() =>
      createChatModel('anthropic', { model: 'claude-sonnet-4-20241022', temperature: 0.7, maxTokens: 1024 }),
    ).toThrow('ANTHROPIC_API_KEY is required');
  });

  it('throws when GOOGLE_API_KEY is missing', () => {
    delete process.env.GOOGLE_API_KEY;
    expect(() =>
      createChatModel('google', { model: 'gemini-2.0-flash-exp', temperature: 0.7, maxTokens: 1024 }),
    ).toThrow('GOOGLE_API_KEY is required');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      createChatModel('unknown-provider', { model: 'x', temperature: 0, maxTokens: 512 }),
    ).toThrow('Unknown provider: unknown-provider');
  });

  it('creates ollama model without API key requirement', () => {
    // Ollama doesn't need an API key — should not throw
    expect(() =>
      createChatModel('ollama', { model: 'llama3.2', temperature: 0.7, maxTokens: 1024 }),
    ).not.toThrow();
  });

  it('creates opencode-zen model when API key is set', () => {
    process.env.OPENCODE_ZEN_API_KEY = 'test-key';
    expect(() =>
      createChatModel('opencode-zen', { model: 'gpt-5.1-codex', temperature: 0.7, maxTokens: 1024 }),
    ).not.toThrow();
  });
});

// ─── createLLMChain ───────────────────────────────────────────────────────────

describe('createLLMChain', () => {
  it('throws when no valid providers can be created', () => {
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    expect(() =>
      createLLMChain({
        providers: [
          { name: 'opencode-zen' },
          { name: 'openai' },
          { name: 'anthropic' },
          { name: 'google' },
        ],
      }),
    ).toThrow('No valid providers could be created');
  });

  it('creates a chain with just ollama (no API key needed)', () => {
    const chain = createLLMChain({
      providers: [{ name: 'ollama', model: 'llama3.2' }],
    });
    expect(chain.runnable).toBeDefined();
    expect(chain.costHandlers).toHaveLength(1);
    expect(typeof chain.getTotalCost).toBe('function');
    expect(typeof chain.getCostHistory).toBe('function');
  });

  it('getTotalCost returns 0 before any invocations', () => {
    const chain = createLLMChain({ providers: [{ name: 'ollama', model: 'llama3.2' }] });
    expect(chain.getTotalCost()).toBe(0);
  });

  it('getCostHistory returns empty array before any invocations', () => {
    const chain = createLLMChain({ providers: [{ name: 'ollama', model: 'llama3.2' }] });
    expect(chain.getCostHistory()).toEqual([]);
  });
});

// ─── Helper functions ─────────────────────────────────────────────────────────

describe('getProviderModels', () => {
  it('returns model list for known providers', () => {
    expect(getProviderModels('openai')).toEqual(PROVIDER_MODELS['openai']);
    expect(getProviderModels('anthropic').length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown provider', () => {
    expect(getProviderModels('nonexistent')).toEqual([]);
  });
});

describe('getAllProviderNames', () => {
  it('returns all 5 provider names', () => {
    const names = getAllProviderNames();
    expect(names).toContain('opencode-zen');
    expect(names).toContain('openai');
    expect(names).toContain('anthropic');
    expect(names).toContain('ollama');
    expect(names).toContain('google');
    expect(names).toHaveLength(5);
  });
});

describe('constants', () => {
  it('DEFAULT_PROVIDER is opencode-zen', () => {
    expect(DEFAULT_PROVIDER).toBe('opencode-zen');
  });

  it('DEFAULT_MODEL is defined', () => {
    expect(DEFAULT_MODEL).toBeTruthy();
  });

  it('PROVIDER_MODELS has entries for all providers', () => {
    for (const name of getAllProviderNames()) {
      expect(PROVIDER_MODELS[name]).toBeDefined();
      expect(PROVIDER_MODELS[name].length).toBeGreaterThan(0);
    }
  });
});
