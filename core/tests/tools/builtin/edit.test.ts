import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEditTool } from '../../../src/tools/builtin/edit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readTmpFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('edit tool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'edit-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('replaceAll omitted (default: replace first only)', () => {
    it('replaces only the first occurrence when replaceAll is not set', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await writeFile(filePath, 'foo foo foo');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'foo', replace: 'bar' },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);
      expect(await readTmpFile(filePath)).toBe('bar foo foo');
    });

    it('replaces only the first occurrence when replaceAll is explicitly false', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await writeFile(filePath, 'abc abc abc');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'abc', replace: 'xyz', replaceAll: false },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);
      expect(await readTmpFile(filePath)).toBe('xyz abc abc');
    });
  });

  describe('replaceAll: true', () => {
    it('replaces all occurrences and returns the correct count', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await writeFile(filePath, 'foo foo foo');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'foo', replace: 'bar', replaceAll: true },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(3);
      expect(await readTmpFile(filePath)).toBe('bar bar bar');
    });

    it('handles multi-line files', async () => {
      const filePath = path.join(tmpDir, 'multi.txt');
      await writeFile(filePath, 'hello world\nhello earth\nhello mars');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'hello', replace: 'bye', replaceAll: true },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(3);
      expect(await readTmpFile(filePath)).toBe('bye world\nbye earth\nbye mars');
    });

    it('returns replacements: 1 when only one occurrence exists', async () => {
      const filePath = path.join(tmpDir, 'single.txt');
      await writeFile(filePath, 'only one needle here');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'needle', replace: 'pin', replaceAll: true },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);
      expect(await readTmpFile(filePath)).toBe('only one pin here');
    });
  });

  describe('search text not found', () => {
    it('returns success: false with an error message', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await writeFile(filePath, 'some content');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: filePath, search: 'NOTPRESENT', replace: 'something' },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('NOTPRESENT'),
      });
      // File must be unchanged
      expect(await readTmpFile(filePath)).toBe('some content');
    });
  });

  describe('file not found', () => {
    it('returns success: false with an error message', async () => {
      const tool = createEditTool();
      const result = await tool.execute(
        { path: '/does/not/exist/file.txt', search: 'x', replace: 'y' },
        { workspaceDir: tmpDir },
      );

      expect(result).toMatchObject({ success: false, error: expect.any(String) });
    });
  });

  describe('relative paths', () => {
    it('resolves path relative to workspaceDir', async () => {
      const filePath = path.join(tmpDir, 'relative.txt');
      await writeFile(filePath, 'alpha beta alpha');

      const tool = createEditTool();
      const result = await tool.execute(
        { path: 'relative.txt', search: 'alpha', replace: 'gamma', replaceAll: true },
        { workspaceDir: tmpDir },
      ) as { success: boolean; replacements: number };

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(2);
      expect(await readTmpFile(filePath)).toBe('gamma beta gamma');
    });
  });
});
