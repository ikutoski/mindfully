import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── stdout mock ──────────────────────────────────────────────────────────────

let written: string[] = [];
const originalIsTTY = process.stdout.isTTY;

function capturedOutput(): string {
  return written.join('');
}

beforeEach(() => {
  written = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    written.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
});

import { formatToolDone, formatToolPending, ConcurrentToolRenderer, renderHeader, renderSessionExit } from '../src/render.js';

// ─── formatToolDone ───────────────────────────────────────────────────────────

describe('formatToolDone', () => {
  it('shows ✓ for success', () => {
    const line = formatToolDone('bash', 'output\nline2', undefined, 42);
    expect(line).toContain('✓');
    expect(line).toContain('bash');
    expect(line).toContain('(42ms)');
  });

  it('shows ✗ for error', () => {
    const line = formatToolDone('bash', undefined, 'command not found', 10);
    expect(line).toContain('✗');
    expect(line).toContain('command not found');
    expect(line).toContain('(10ms)');
  });

  it('summarises string result as character count', () => {
    const line = formatToolDone('bash', 'hello\nworld', undefined, 5);
    expect(line).toContain('11 character');
  });

  it('shows (empty) for null result', () => {
    const line = formatToolDone('bash', null, undefined, 1);
    expect(line).toContain('(empty)');
  });
});

// ─── formatToolPending ────────────────────────────────────────────────────────

describe('formatToolPending', () => {
  it('contains ⋯ and the tool name', () => {
    const line = formatToolPending('bash', { command: 'ls' });
    expect(line).toContain('⋯');
    expect(line).toContain('bash');
  });

  it('includes a formatted args preview', () => {
    const line = formatToolPending('read', { path: 'src/index.ts' });
    expect(line).toContain('path=');
    expect(line).toContain('src/index.ts');
  });
});

// ─── ConcurrentToolRenderer ───────────────────────────────────────────────────

describe('ConcurrentToolRenderer', () => {
  it('addTool prints a pending line immediately', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('tc-1', 'bash', { command: 'ls' });
    const out = capturedOutput();
    expect(out).toContain('⋯');
    expect(out).toContain('bash');
  });

  it('addTool only prints the pending line once per ID (streaming delta guard)', () => {
    const renderer = new ConcurrentToolRenderer();
    // Simulate multiple streaming chunks for the same tool call ID
    renderer.addTool('tc-1', 'bash', { command: '' });
    renderer.addTool('tc-1', 'bash', { command: 'ls -la' });
    renderer.addTool('tc-1', 'bash', { command: 'ls -la /tmp' });
    const pendingCount = (capturedOutput().match(/⋯/g) ?? []).length;
    expect(pendingCount).toBe(1);
  });

  it('addTool with empty name does not print (LLM delta chunk guard)', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('', '', {});
    expect(capturedOutput()).toBe('');
  });

  it('addTool then completeTool prints a pending line then a done line', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('tc-1', 'bash', { command: 'ls' });
    renderer.completeTool('tc-1', 'file.txt', undefined);
    const out = capturedOutput();
    expect(out).toContain('⋯');
    expect(out).toContain('✓');
    expect(out).toContain('bash');
    expect(out).toContain('\n');
  });

  it('completeTool prints an error line for errors', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('tc-1', 'bash', { command: 'bad' });
    renderer.completeTool('tc-1', undefined, 'command not found');
    const out = capturedOutput();
    expect(out).toContain('✗');
    expect(out).toContain('command not found');
  });

  it('completeTool for unknown id is a no-op (beyond the pending line)', () => {
    const renderer = new ConcurrentToolRenderer();
    expect(() => renderer.completeTool('nonexistent', 'x', undefined)).not.toThrow();
    // nothing for completeTool since id was never registered
    expect(capturedOutput()).toBe('');
  });

  it('stop() does not throw', () => {
    const renderer = new ConcurrentToolRenderer();
    expect(() => renderer.stop()).not.toThrow();
    expect(() => renderer.stop()).not.toThrow();
  });

  it('handles multiple concurrent tools', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('tc-1', 'bash', { command: 'ls' });
    renderer.addTool('tc-2', 'web_search', { query: 'hello' });
    renderer.completeTool('tc-1', 'file.txt', undefined);
    renderer.completeTool('tc-2', 'results', undefined);
    const out = capturedOutput();
    expect(out).toContain('bash');
    expect(out).toContain('web_search');
  });
});

// ─── renderHeader ─────────────────────────────────────────────────────────────

describe('renderHeader', () => {
  const base = {
    prompt: 'explain the auth flow',
    cwd: '/home/user/myproject',
    toolCount: 8,
    model: 'gpt-4o',
    session: 'myproject/a1b2c3d4',
  };

  it('shows "ctx 0" when contextTokens is 0', () => {
    renderHeader({ ...base, contextTokens: 0 });
    expect(capturedOutput()).toContain('ctx');
    expect(capturedOutput()).toContain('0');
  });

  it('shows abbreviated kilo format for contextTokens > 0', () => {
    renderHeader({ ...base, contextTokens: 1234 });
    expect(capturedOutput()).toContain('1.2k');
  });

  it('shows the session label in output', () => {
    renderHeader({ ...base, contextTokens: 0 });
    expect(capturedOutput()).toContain('myproject/a1b2c3d4');
  });

  it('shows the prompt in output', () => {
    renderHeader({ ...base, contextTokens: 0 });
    expect(capturedOutput()).toContain('explain the auth flow');
  });

  it('shows the model name in output', () => {
    renderHeader({ ...base, contextTokens: 0 });
    expect(capturedOutput()).toContain('gpt-4o');
  });

  it('shows 10.0k for exactly 10000 tokens', () => {
    renderHeader({ ...base, contextTokens: 10000 });
    expect(capturedOutput()).toContain('10.0k');
  });
});

// ─── renderSessionExit ────────────────────────────────────────────────────────

describe('renderSessionExit', () => {
  it('prints the thread ID', () => {
    renderSessionExit('a1b2c3d4');
    expect(capturedOutput()).toContain('a1b2c3d4');
  });

  it('output ends with a newline', () => {
    renderSessionExit('deadbeef');
    expect(capturedOutput()).toMatch(/\n$/);
  });

  it('prints "session" label alongside the ID', () => {
    renderSessionExit('cafebabe');
    expect(capturedOutput()).toContain('session');
    expect(capturedOutput()).toContain('cafebabe');
  });
});
