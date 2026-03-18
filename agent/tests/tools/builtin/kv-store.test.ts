import { describe, it, expect, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createKvStoreTool } from '../../../src/tools/builtin/kv-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(dir: string, passphrase = 'test-passphrase') {
  return {
    configurable: {
      kvStorePath: path.join(dir, 'kv-store.json'),
      kvPassphrase: passphrase,
    },
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kv-store-test-'));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('kv_store tool — missing config', () => {
  it('returns error when kvPassphrase is missing', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke(
        { operation: 'list' },
        { configurable: { kvStorePath: '/tmp/kv.json' } },
      ),
    ) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kvPassphrase/);
  });

  it('returns error when kvStorePath is missing', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke(
        { operation: 'list' },
        { configurable: { kvPassphrase: 'secret' } },
      ),
    ) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kvStorePath/);
  });

  it('returns error when no configurable is provided', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke({ operation: 'list' }),
    ) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kvPassphrase/);
  });
});

describe('kv_store tool — list', () => {
  it('returns empty keys on a fresh store', async () => {
    const dir = await makeTempDir();
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke({ operation: 'list' }, makeConfig(dir)),
    ) as { success: boolean; keys: string[] };

    expect(result.success).toBe(true);
    expect(result.keys).toEqual([]);
  });
});

describe('kv_store tool — set / get / delete', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempDir();
  });

  it('sets a value and gets it back', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    const setResult = JSON.parse(
      await tool.invoke({ operation: 'set', key: 'my-key', value: 'my-value' }, config),
    ) as { success: boolean };
    expect(setResult.success).toBe(true);

    const getResult = JSON.parse(
      await tool.invoke({ operation: 'get', key: 'my-key' }, config),
    ) as { success: boolean; value: string };
    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('my-value');
  });

  it('lists keys after set', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    await tool.invoke({ operation: 'set', key: 'alpha', value: '1' }, config);
    await tool.invoke({ operation: 'set', key: 'beta', value: '2' }, config);

    const result = JSON.parse(
      await tool.invoke({ operation: 'list' }, config),
    ) as { success: boolean; keys: string[] };

    expect(result.success).toBe(true);
    expect(result.keys.sort()).toEqual(['alpha', 'beta']);
  });

  it('overwrites an existing key', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    await tool.invoke({ operation: 'set', key: 'k', value: 'first' }, config);
    await tool.invoke({ operation: 'set', key: 'k', value: 'second' }, config);

    const result = JSON.parse(
      await tool.invoke({ operation: 'get', key: 'k' }, config),
    ) as { success: boolean; value: string };
    expect(result.value).toBe('second');
  });

  it('deletes a key', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    await tool.invoke({ operation: 'set', key: 'to-delete', value: 'x' }, config);
    const delResult = JSON.parse(
      await tool.invoke({ operation: 'delete', key: 'to-delete' }, config),
    ) as { success: boolean };
    expect(delResult.success).toBe(true);

    const listResult = JSON.parse(
      await tool.invoke({ operation: 'list' }, config),
    ) as { success: boolean; keys: string[] };
    expect(listResult.keys).not.toContain('to-delete');
  });

  it('delete on non-existent key still succeeds', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    const result = JSON.parse(
      await tool.invoke({ operation: 'delete', key: 'ghost' }, config),
    ) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it('get on missing key returns error', async () => {
    const tool = createKvStoreTool();
    const config = makeConfig(dir);

    const result = JSON.parse(
      await tool.invoke({ operation: 'get', key: 'missing' }, config),
    ) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });
});

describe('kv_store tool — validation', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempDir();
  });

  it('returns error when key is missing for get', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke({ operation: 'get' }, makeConfig(dir)),
    ) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/key/);
  });

  it('returns error when key is missing for set', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke({ operation: 'set', value: 'v' }, makeConfig(dir)),
    ) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/key/);
  });

  it('returns error when value is missing for set', async () => {
    const tool = createKvStoreTool();
    const result = JSON.parse(
      await tool.invoke({ operation: 'set', key: 'k' }, makeConfig(dir)),
    ) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/value/);
  });
});

describe('kv_store tool — encryption isolation', () => {
  it('data written with one passphrase cannot be read with another', async () => {
    const dir = await makeTempDir();
    const tool = createKvStoreTool();

    await tool.invoke(
      { operation: 'set', key: 'secret', value: 'treasure' },
      makeConfig(dir, 'correct-horse'),
    );

    // Reading with the wrong passphrase — AES-GCM auth tag will fail
    const result = JSON.parse(
      await tool.invoke(
        { operation: 'get', key: 'secret' },
        makeConfig(dir, 'wrong-passphrase'),
      ),
    ) as { success: boolean; error: string };

    expect(result.success).toBe(false);
  });

  it('store file on disk contains no plaintext value', async () => {
    const dir = await makeTempDir();
    const kvPath = path.join(dir, 'kv-store.json');
    const tool = createKvStoreTool();

    await tool.invoke(
      { operation: 'set', key: 'pw', value: 'super-secret-123' },
      makeConfig(dir),
    );

    const raw = await fs.readFile(kvPath, 'utf-8');
    expect(raw).not.toContain('super-secret-123');
  });

  it('persists across separate tool instances (simulating process restarts)', async () => {
    const dir = await makeTempDir();
    const config = makeConfig(dir);

    // Write with first instance
    const tool1 = createKvStoreTool();
    await tool1.invoke({ operation: 'set', key: 'persistent', value: 'hello' }, config);

    // Read with second instance
    const tool2 = createKvStoreTool();
    const result = JSON.parse(
      await tool2.invoke({ operation: 'get', key: 'persistent' }, config),
    ) as { success: boolean; value: string };

    expect(result.success).toBe(true);
    expect(result.value).toBe('hello');
  });
});
