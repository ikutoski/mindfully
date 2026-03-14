import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessRegistry } from '../../../src/tools/builtin/process-registry.js';
import { createProcessTool } from '../../../src/tools/builtin/process.js';
import { createBashTool } from '../../../src/tools/builtin/bash.js';

describe('ProcessRegistry', () => {
  beforeEach(() => {
    ProcessRegistry.reset();
  });

  afterEach(() => {
    ProcessRegistry.reset();
  });

  it('spawn returns an entry with a unique id', () => {
    const registry = ProcessRegistry.getInstance();
    const e1 = registry.spawn('echo hello', process.cwd());
    const e2 = registry.spawn('echo world', process.cwd());
    expect(e1.id).toBe('1');
    expect(e2.id).toBe('2');
    expect(e1.id).not.toBe(e2.id);
  });

  it('get returns the entry by id', () => {
    const registry = ProcessRegistry.getInstance();
    const entry = registry.spawn('echo hi', process.cwd());
    expect(registry.get(entry.id)).toBe(entry);
  });

  it('get returns undefined for unknown id', () => {
    const registry = ProcessRegistry.getInstance();
    expect(registry.get('999')).toBeUndefined();
  });

  it('list returns all spawned entries', () => {
    const registry = ProcessRegistry.getInstance();
    registry.spawn('sleep 60', process.cwd());
    registry.spawn('sleep 60', process.cwd());
    expect(registry.list()).toHaveLength(2);
  });

  it('kill returns false for unknown id', () => {
    const registry = ProcessRegistry.getInstance();
    expect(registry.kill('999')).toBe(false);
  });

  it('kill terminates a running process', async () => {
    const registry = ProcessRegistry.getInstance();
    const entry = registry.spawn('sleep 60', process.cwd());
    expect(entry.status).toBe('running');
    const killed = registry.kill(entry.id);
    expect(killed).toBe(true);
    expect(entry.status).toBe('killed');
  });

  it('kill returns false for already-killed process', () => {
    const registry = ProcessRegistry.getInstance();
    const entry = registry.spawn('sleep 60', process.cwd());
    registry.kill(entry.id);
    expect(registry.kill(entry.id)).toBe(false);
  });

  it('write returns false for unknown id', () => {
    const registry = ProcessRegistry.getInstance();
    expect(registry.write('999', 'hello')).toBe(false);
  });

  it('captures stdout of a quick command', async () => {
    const registry = ProcessRegistry.getInstance();
    const entry = registry.spawn("echo 'captured'", process.cwd());
    // Wait for process to finish
    await new Promise<void>((resolve) => {
      entry.process.on('exit', () => resolve());
      setTimeout(resolve, 2000);
    });
    expect(entry.stdout).toContain('captured');
  });
});

describe('process tool', () => {
  const tool = createProcessTool();

  beforeEach(() => {
    ProcessRegistry.reset();
  });

  afterEach(() => {
    ProcessRegistry.reset();
  });

  it('list returns empty array when no processes', async () => {
    const result = await tool.execute({ action: 'list' }) as {
      success: boolean; processes: unknown[];
    };
    expect(result.success).toBe(true);
    expect(result.processes).toEqual([]);
  });

  it('poll returns error for unknown id', async () => {
    const result = await tool.execute({ action: 'poll', id: '99' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('kill returns error for unknown id', async () => {
    const result = await tool.execute({ action: 'kill', id: '99' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('write returns error for unknown id', async () => {
    const result = await tool.execute({ action: 'write', id: '99', input: 'hi' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });

  it('poll returns process info after spawn', async () => {
    const registry = ProcessRegistry.getInstance();
    registry.spawn('sleep 60', process.cwd());

    const result = await tool.execute({ action: 'poll', id: '1' }) as {
      success: boolean; id: string; status: string;
    };
    expect(result.success).toBe(true);
    expect(result.id).toBe('1');
    expect(['running', 'exited']).toContain(result.status);
  });

  it('kill stops a running process', async () => {
    const registry = ProcessRegistry.getInstance();
    registry.spawn('sleep 60', process.cwd());

    const result = await tool.execute({ action: 'kill', id: '1' }) as {
      success: boolean; killed: boolean;
    };
    expect(result.success).toBe(true);
    expect(result.killed).toBe(true);
  });

  it('list shows spawned processes', async () => {
    const registry = ProcessRegistry.getInstance();
    registry.spawn('sleep 60', process.cwd());
    registry.spawn('sleep 60', process.cwd());

    const result = await tool.execute({ action: 'list' }) as {
      success: boolean; processes: Array<{ id: string }>;
    };
    expect(result.success).toBe(true);
    expect(result.processes).toHaveLength(2);
  });
});

describe('bash tool background mode', () => {
  const tool = createBashTool();

  beforeEach(() => {
    ProcessRegistry.reset();
  });

  afterEach(() => {
    ProcessRegistry.reset();
  });

  it('returns a process id when background:true', async () => {
    const result = await tool.execute({ command: 'sleep 60', background: true }) as {
      success: boolean; background: boolean; id: string; pid: number;
    };
    expect(result.success).toBe(true);
    expect(result.background).toBe(true);
    expect(result.id).toBeDefined();
    expect(typeof result.pid === 'number' || result.pid === undefined).toBe(true);
  });

  it('foreground commands still work after background mode is added', async () => {
    const result = await tool.execute({ command: 'echo hello' }) as {
      success: boolean; stdout: string;
    };
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });
});
