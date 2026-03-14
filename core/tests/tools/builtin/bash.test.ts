import { describe, it, expect, vi } from 'vitest';
import { createBashTool } from '../../../src/tools/builtin/bash.js';

describe('bash tool onChunk streaming', () => {
  const tool = createBashTool();

  it('calls onChunk with stdout chunks during foreground execution', async () => {
    const chunks: string[] = [];
    const result = await tool.execute(
      { command: 'printf "line1\nline2\n"' },
      {
        workspaceDir: process.cwd(),
        onChunk: (text) => chunks.push(text),
      },
    ) as { success: boolean; stdout: string };

    expect(result.success).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('line1');
    expect(chunks.join('')).toContain('line2');
  });

  it('calls onChunk with stderr chunks during foreground execution', async () => {
    const chunks: string[] = [];
    await tool.execute(
      { command: 'echo errout >&2' },
      {
        workspaceDir: process.cwd(),
        onChunk: (text) => chunks.push(text),
      },
    );

    expect(chunks.join('')).toContain('errout');
  });

  it('does not throw when onChunk is not provided (backward compat)', async () => {
    const result = await tool.execute(
      { command: 'echo hello' },
      { workspaceDir: process.cwd() },
    ) as { success: boolean; stdout: string };

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('does not call onChunk in background mode', async () => {
    const onChunk = vi.fn();
    const result = await tool.execute(
      { command: 'echo bg', background: true },
      { workspaceDir: process.cwd(), onChunk },
    ) as { success: boolean; background: boolean };

    expect(result.background).toBe(true);
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('accumulates full stdout regardless of chunk boundaries', async () => {
    const result = await tool.execute(
      { command: 'printf "a\nb\nc\n"' },
      { workspaceDir: process.cwd() },
    ) as { success: boolean; stdout: string };

    expect(result.stdout).toBe('a\nb\nc\n');
  });
});
