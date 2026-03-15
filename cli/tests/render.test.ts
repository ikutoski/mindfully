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

import { formatToolDone, ConcurrentToolRenderer } from '../src/render.js';

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

  it('summarises string result as lines + bytes', () => {
    const line = formatToolDone('bash', 'hello\nworld', undefined, 5);
    expect(line).toContain('2 lines');
  });

  it('shows (empty) for null result', () => {
    const line = formatToolDone('bash', null, undefined, 1);
    expect(line).toContain('(empty)');
  });
});

// ─── ConcurrentToolRenderer ───────────────────────────────────────────────────

describe('ConcurrentToolRenderer', () => {
  it('addTool then completeTool prints a done line', () => {
    const renderer = new ConcurrentToolRenderer();
    renderer.addTool('tc-1', 'bash', { command: 'ls' });
    expect(capturedOutput()).toBe(''); // nothing printed on addTool

    renderer.completeTool('tc-1', 'file.txt', undefined);
    const out = capturedOutput();
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

  it('completeTool for unknown id is a no-op', () => {
    const renderer = new ConcurrentToolRenderer();
    expect(() => renderer.completeTool('nonexistent', 'x', undefined)).not.toThrow();
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
