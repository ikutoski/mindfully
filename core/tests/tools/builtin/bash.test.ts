import { describe, it, expect } from 'vitest';
import { createBashTool } from '../../../src/tools/builtin/bash.js';

describe('bash tool', () => {
  it('executes a foreground command and returns stdout', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke(
        { command: 'echo hello' },
        { configurable: { workspaceDir: process.cwd() } },
      ),
    ) as { success: boolean; stdout: string };

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('accumulates full stdout regardless of chunk boundaries', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke(
        { command: 'printf "a\nb\nc\n"' },
        { configurable: { workspaceDir: process.cwd() } },
      ),
    ) as { success: boolean; stdout: string };

    expect(result.stdout).toBe('a\nb\nc\n');
  });

  it('captures stderr separately', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke(
        { command: 'echo errout >&2' },
        { configurable: { workspaceDir: process.cwd() } },
      ),
    ) as { success: boolean; stderr: string };

    expect(result.stderr).toContain('errout');
  });

  it('uses process.cwd() when workspaceDir is not in configurable', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke({ command: 'echo hello' }),
    ) as { success: boolean; stdout: string };

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });
});

describe('bash tool background mode', () => {
  it('returns background process info when background:true', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke(
        { command: 'sleep 60', background: true },
        { configurable: { workspaceDir: process.cwd() } },
      ),
    ) as { success: boolean; background: boolean; id: string; pid: number };

    expect(result.success).toBe(true);
    expect(result.background).toBe(true);
    expect(result.id).toBeDefined();
    expect(typeof result.pid === 'number' || result.pid === undefined).toBe(true);
  });

  it('foreground commands still work after background mode is added', async () => {
    const tool = createBashTool();
    const result = JSON.parse(
      await tool.invoke(
        { command: 'echo hello' },
        { configurable: { workspaceDir: process.cwd() } },
      ),
    ) as { success: boolean; stdout: string };

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });
});
