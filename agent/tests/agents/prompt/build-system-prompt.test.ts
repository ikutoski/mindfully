import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { z } from 'core';
import { buildSystemPrompt } from '../../../src/agents/prompt/build-system-prompt.js';
import type { Tool } from 'core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs/promises')>();
  return { ...mod, readFile: vi.fn() };
});

const mockReadFile = vi.mocked(fs.readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string, description = `${name} description`): Tool {
  return {
    name,
    description,
    inputSchema: z.object({ query: z.string().optional() }),
    execute: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSystemPrompt()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all workspace files missing
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('includes tool names in Layer 2 output', async () => {
    const tools = [makeTool('read'), makeTool('bash')];
    const result = await buildSystemPrompt({ tools, workspaceDir: '/tmp/workspace' });

    expect(result).toContain('# Layer 2: Tool Definitions');
    expect(result).toContain('read');
    expect(result).toContain('bash');
  });

  it('uses agentSystemPrompt as Layer 1 core instructions', async () => {
    const tools = [makeTool('read')];
    const customPrompt = 'You are a specialist code reviewer.';

    const result = await buildSystemPrompt({
      tools,
      workspaceDir: '/tmp/workspace',
      agentSystemPrompt: customPrompt,
    });

    expect(result).toContain('# Layer 1: Core Instructions');
    expect(result).toContain(customPrompt);
    // Default identity should NOT be present
    expect(result).not.toContain('You are Mindful');
  });

  it('uses default identity when agentSystemPrompt is not provided', async () => {
    const result = await buildSystemPrompt({ tools: [], workspaceDir: '/tmp/workspace' });

    expect(result).toContain('You are Mindful');
  });

  it('includes runtime info (time, OS, working directory) in Layer 6', async () => {
    const result = await buildSystemPrompt({
      tools: [],
      workspaceDir: '/my/project',
    });

    expect(result).toContain('# Layer 6: Runtime Information');
    expect(result).toContain('/my/project');
    // currentTime should be an ISO timestamp — crude check
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes layer headers for all major layers', async () => {
    const result = await buildSystemPrompt({ tools: [], workspaceDir: '/tmp' });

    expect(result).toContain('# Layer 1:');
    expect(result).toContain('# Layer 2:');
    expect(result).toContain('# Layer 6:');
    expect(result).toContain('# Layer 7:');
  });

  it('loads workspace files when they exist and includes them in Layer 7', async () => {
    mockReadFile
      .mockResolvedValueOnce('I am the identity file') // IDENTITY.md
      .mockResolvedValueOnce('I am the agents file')   // AGENTS.md
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // MEMORY.md

    const result = await buildSystemPrompt({ tools: [], workspaceDir: '/tmp/workspace' });

    expect(result).toContain('# Layer 7: Workspace Files');
    expect(result).toContain('IDENTITY.md');
    expect(result).toContain('I am the identity file');
    expect(result).toContain('AGENTS.md');
    expect(result).toContain('I am the agents file');
    expect(result).not.toContain('MEMORY.md');
  });

  it('silently skips missing workspace files — does not throw', async () => {
    // All three files missing
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(
      buildSystemPrompt({ tools: [], workspaceDir: '/nonexistent' }),
    ).resolves.not.toThrow();
  });
});
