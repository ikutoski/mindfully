/**
 * Tests for the PromptBuilder (LangChain ChatPromptTemplate-backed).
 *
 * Tests verify:
 *  - build() returns a non-empty string
 *  - Each layer is present in the output
 *  - buildTemplate() returns a ChatPromptTemplate
 *  - Truncation works correctly
 *  - Custom core instructions replace the default
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PromptBuilder, createPromptBuilder, type PromptBuildOptions } from '../../../src/agents/prompt/builder.js';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// ─── PromptBuilder.build() ────────────────────────────────────────────────────

describe('PromptBuilder.build()', () => {
  it('returns a non-empty string', () => {
    const builder = new PromptBuilder();
    const result = builder.build({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes Layer 1 — Core Instructions', () => {
    const builder = new PromptBuilder();
    const result = builder.build({});
    expect(result).toContain('Layer 1: Core Instructions');
    expect(result).toContain('Mindful');
  });

  it('uses custom core instructions when provided', () => {
    const builder = new PromptBuilder();
    const result = builder.build({ coreInstructions: 'Custom instructions here.' });
    expect(result).toContain('Custom instructions here.');
    expect(result).not.toContain('You are Mindful');
  });

  it('includes Layer 2 — Tool Definitions with tool names', () => {
    const builder = new PromptBuilder();
    const tools = [
      { name: 'bash', description: 'Run shell commands', inputSchema: z.object({}) },
      { name: 'read', description: 'Read a file', inputSchema: z.object({}) },
    ];
    const result = builder.build({ tools });
    expect(result).toContain('Layer 2: Tool Definitions');
    expect(result).toContain('## bash');
    expect(result).toContain('## read');
  });

  it('shows "No tools available" when tools array is empty', () => {
    const builder = new PromptBuilder();
    const result = builder.build({ tools: [] });
    expect(result).toContain('No tools available');
  });

  it('includes Layer 3 — Skills Registry', () => {
    const builder = new PromptBuilder();
    const skills = [{ name: 'coding', description: 'Write code' }];
    const result = builder.build({ skills });
    expect(result).toContain('Layer 3: Skills Registry');
    expect(result).toContain('coding');
  });

  it('includes Layer 4 — Model Aliases', () => {
    const builder = new PromptBuilder();
    const result = builder.build({});
    expect(result).toContain('Layer 4: Model Aliases');
    expect(result).toContain('gpt-4o');
  });

  it('includes Layer 5 — Protocol Specifications', () => {
    const builder = new PromptBuilder();
    const result = builder.build({});
    expect(result).toContain('Layer 5: Protocol Specifications');
  });

  it('includes Layer 6 — Runtime Information with current time', () => {
    const builder = new PromptBuilder();
    const runtimeInfo = {
      currentTime: '2026-01-01T00:00:00.000Z',
      os: 'macOS',
      workingDirectory: '/workspace',
      environment: 'test',
    };
    const result = builder.build({ runtimeInfo });
    expect(result).toContain('Layer 6: Runtime Information');
    expect(result).toContain('2026-01-01T00:00:00.000Z');
    expect(result).toContain('macOS');
  });

  it('includes Layer 7 — Workspace Files with identity content', () => {
    const builder = new PromptBuilder();
    const workspaceFiles = {
      identity: 'I am a helpful agent.',
      agents: 'Agent guidelines here.',
    };
    const result = builder.build({ workspaceFiles });
    expect(result).toContain('Layer 7: Workspace Files');
    expect(result).toContain('IDENTITY.md');
    expect(result).toContain('I am a helpful agent.');
    expect(result).toContain('AGENTS.md');
  });

  it('includes custom workspace files', () => {
    const builder = new PromptBuilder();
    const result = builder.build({
      workspaceFiles: {
        custom: { 'CUSTOM.md': 'Custom content here.' },
      },
    });
    expect(result).toContain('CUSTOM.md');
    expect(result).toContain('Custom content here.');
  });

  it('includes Layer 8 — Bootstrap Hooks', () => {
    const builder = new PromptBuilder();
    const hooks = [{ name: 'init', content: 'Initialize the agent.' }];
    const result = builder.build({ bootstrapHooks: hooks });
    expect(result).toContain('Layer 8: Bootstrap Hooks');
    expect(result).toContain('init');
    expect(result).toContain('Initialize the agent.');
  });

  it('includes Layer 9 — Inbound Context with conversation history', () => {
    const builder = new PromptBuilder();
    const history = [
      { role: 'user' as const, content: 'What is the weather?' },
      { role: 'assistant' as const, content: 'It is sunny.' },
    ];
    const result = builder.build({ conversationHistory: history });
    expect(result).toContain('Layer 9: Inbound Context');
    expect(result).toContain('What is the weather?');
    expect(result).toContain('It is sunny.');
  });

  it('truncates prompt that exceeds 80% of maxContextTokens', () => {
    const smallMax = 100; // 100 * 4 * 0.8 = 320 chars
    const builder = new PromptBuilder(smallMax);
    const longContent = 'A'.repeat(500);
    const result = builder.build({ coreInstructions: longContent });
    expect(result).toContain('... (context truncated)');
    expect(result.length).toBeLessThan(500);
  });

  it('does not truncate prompt within 80% of maxContextTokens', () => {
    const builder = new PromptBuilder(100000);
    const result = builder.build({});
    expect(result).not.toContain('... (context truncated)');
  });
});

// ─── PromptBuilder.buildTemplate() ───────────────────────────────────────────

describe('PromptBuilder.buildTemplate()', () => {
  it('returns a ChatPromptTemplate instance', () => {
    const builder = new PromptBuilder();
    const template = builder.buildTemplate({});
    expect(template).toBeInstanceOf(ChatPromptTemplate);
  });

  it('template has inputVariables including "input"', () => {
    const builder = new PromptBuilder();
    const template = builder.buildTemplate({});
    expect(template.inputVariables).toContain('input');
  });

  it('formats the template with a user input', async () => {
    const builder = new PromptBuilder();
    const template = builder.buildTemplate({
      coreInstructions: 'You are a test agent.',
    });
    const messages = await template.formatMessages({ input: 'Hello, agent!' });
    expect(messages.length).toBeGreaterThanOrEqual(1);
    // The human message should contain the input
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toContain('Hello, agent!');
  });
});

// ─── createPromptBuilder factory ─────────────────────────────────────────────

describe('createPromptBuilder', () => {
  it('creates a PromptBuilder instance', () => {
    const builder = createPromptBuilder();
    expect(builder).toBeInstanceOf(PromptBuilder);
  });

  it('forwards maxContextTokens to the instance', () => {
    const builder = createPromptBuilder(500);
    // With 500 max tokens and short instructions, it shouldn't truncate
    const result = builder.build({ coreInstructions: 'Short.' });
    expect(result).not.toContain('... (context truncated)');
  });
});

// ─── Options interface coverage ───────────────────────────────────────────────

describe('PromptBuildOptions coverage', () => {
  it('handles all options simultaneously', () => {
    const options: PromptBuildOptions = {
      coreInstructions: 'Custom system prompt.',
      tools: [{ name: 'tool1', description: 'A tool', inputSchema: z.object({ type: z.string().optional() }) }],
      skills: [{ name: 'skill1', description: 'A skill' }],
      modelAlias: 'gpt-4o',
      runtimeInfo: {
        currentTime: '2026-01-01T00:00:00.000Z',
        os: 'linux',
        workingDirectory: '/app',
        environment: 'production',
      },
      workspaceFiles: {
        identity: 'ID content',
        memory: 'Memory content',
      },
      bootstrapHooks: [{ name: 'hook1', content: 'Hook content' }],
      conversationHistory: [{ role: 'user', content: 'Prior message' }],
      maxContextTokens: 50000,
    };

    const builder = new PromptBuilder();
    const result = builder.build(options);

    expect(result).toContain('Custom system prompt.');
    expect(result).toContain('tool1');
    expect(result).toContain('skill1');
    expect(result).toContain('2026-01-01');
    expect(result).toContain('ID content');
    expect(result).toContain('hook1');
    expect(result).toContain('Prior message');
  });
});
