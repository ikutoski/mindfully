import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGlobTool } from '../../../src/tools/builtin/glob.js';

describe('glob tool', () => {
  let tmpDir: string;
  const tool = createGlobTool();

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'glob-test-'));
    // Create test file structure:
    // tmpDir/
    //   src/
    //     index.ts
    //     utils.ts
    //     components/
    //       Button.tsx
    //   tests/
    //     index.test.ts
    //   README.md
    //   package.json
    await mkdir(path.join(tmpDir, 'src', 'components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await writeFile(path.join(tmpDir, 'src', 'index.ts'), '');
    await writeFile(path.join(tmpDir, 'src', 'utils.ts'), '');
    await writeFile(path.join(tmpDir, 'src', 'components', 'Button.tsx'), '');
    await writeFile(path.join(tmpDir, 'tests', 'index.test.ts'), '');
    await writeFile(path.join(tmpDir, 'README.md'), '');
    await writeFile(path.join(tmpDir, 'package.json'), '{}');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches all TypeScript files', async () => {
    const result = await tool.execute({ pattern: '**/*.ts' }, { workspaceDir: tmpDir });
    expect(result).toMatchObject({ success: true });
    const { matches } = result as { success: true; matches: string[]; count: number };
    expect(matches).toHaveLength(3);
    expect(matches).toContain('src/index.ts');
    expect(matches).toContain('src/utils.ts');
    expect(matches).toContain('tests/index.test.ts');
  });

  it('matches tsx files', async () => {
    const result = await tool.execute({ pattern: '**/*.tsx' }, { workspaceDir: tmpDir });
    const { matches } = result as { success: true; matches: string[] };
    expect(matches).toEqual(['src/components/Button.tsx']);
  });

  it('matches all ts and tsx files', async () => {
    const result = await tool.execute({ pattern: '**/*.{ts,tsx}' }, { workspaceDir: tmpDir });
    const { matches } = result as { success: true; matches: string[] };
    expect(matches).toHaveLength(4);
  });

  it('excludes patterns via ignore', async () => {
    const result = await tool.execute(
      { pattern: '**/*.ts', ignore: ['**/tests/**'] },
      { workspaceDir: tmpDir },
    );
    const { matches } = result as { success: true; matches: string[] };
    expect(matches).not.toContain('tests/index.test.ts');
    expect(matches).toHaveLength(2);
  });

  it('respects cwd option', async () => {
    const result = await tool.execute(
      { pattern: '*.ts', cwd: 'src' },
      { workspaceDir: tmpDir },
    );
    const { matches } = result as { success: true; matches: string[] };
    expect(matches).toHaveLength(2);
    expect(matches).toContain('index.ts');
    expect(matches).toContain('utils.ts');
  });

  it('returns absolute paths when absolute: true', async () => {
    const result = await tool.execute(
      { pattern: 'README.md', absolute: true },
      { workspaceDir: tmpDir },
    );
    const { matches } = result as { success: true; matches: string[] };
    expect(matches).toHaveLength(1);
    expect(path.isAbsolute(matches[0])).toBe(true);
    expect(matches[0]).toContain('README.md');
  });

  it('returns empty array when nothing matches', async () => {
    const result = await tool.execute({ pattern: '**/*.go' }, { workspaceDir: tmpDir });
    expect(result).toMatchObject({ success: true, matches: [], count: 0 });
  });

  it('returns count matching matches length', async () => {
    const result = await tool.execute({ pattern: '**/*.ts' }, { workspaceDir: tmpDir });
    const r = result as { success: true; matches: string[]; count: number };
    expect(r.count).toBe(r.matches.length);
  });

  it('returns error on empty pattern (fast-glob rejects it)', async () => {
    // fast-glob throws on an empty pattern string
    const result = await tool.execute({ pattern: '' }, { workspaceDir: tmpDir });
    expect(result).toMatchObject({ success: false });
  });
});
