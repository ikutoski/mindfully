import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { z } from 'zod';
import { tool } from 'langchain';
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from 'core';

const logger = createLogger('core:kv-store');

// ─── Types ────────────────────────────────────────────────────────────────────

interface KvEntry {
  iv: string;   // hex, 12 bytes
  tag: string;  // hex, 16 bytes
  ct: string;   // hex, ciphertext
}

interface KvFile {
  salt: string;  // hex, 32 bytes
  entries: Record<string, KvEntry>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const KvStoreSchema = z.object({
  operation: z.enum(['get', 'set', 'delete', 'list']),
  key: z.string().optional().describe('Required for get/set/delete'),
  value: z.string().optional().describe('Required for set'),
});

export type KvStoreInput = z.infer<typeof KvStoreSchema>;

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function deriveKey(passphrase: string, saltHex: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(passphrase, salt, 32, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function encrypt(plaintext: string, key: Buffer): KvEntry {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ct: ct.toString('hex'),
  };
}

function decrypt(entry: KvEntry, key: Buffer): string {
  const iv = Buffer.from(entry.iv, 'hex');
  const tag = Buffer.from(entry.tag, 'hex');
  const ct = Buffer.from(entry.ct, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

// ─── File helpers ─────────────────────────────────────────────────────────────

async function loadKvFile(kvPath: string): Promise<KvFile> {
  try {
    const raw = await fs.readFile(kvPath, 'utf-8');
    return JSON.parse(raw) as KvFile;
  } catch {
    // File doesn't exist yet — create a fresh store with a new random salt
    return { salt: crypto.randomBytes(32).toString('hex'), entries: {} };
  }
}

async function saveKvFile(kvPath: string, data: KvFile): Promise<void> {
  const tmpPath = `${kvPath}.tmp`;
  await fs.mkdir(path.dirname(kvPath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, kvPath);
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createKvStoreTool() {
  return tool(
    async (args: KvStoreInput, config?: RunnableConfig) => {
      try {
        const configurable = config?.configurable as Record<string, unknown> | undefined;
        const kvStorePath = configurable?.['kvStorePath'] as string | undefined;
        const kvPassphrase = configurable?.['kvPassphrase'] as string | undefined;

        if (!kvPassphrase) {
          return JSON.stringify({ success: false, error: 'kv_store not configured: missing kvPassphrase' });
        }
        if (!kvStorePath) {
          return JSON.stringify({ success: false, error: 'kv_store not configured: missing kvStorePath' });
        }

        const kvFile = await loadKvFile(kvStorePath);
        const key = await deriveKey(kvPassphrase, kvFile.salt);

        switch (args.operation) {
          case 'list': {
            const keys = Object.keys(kvFile.entries);
            logger.debug('kv list', { count: keys.length });
            return JSON.stringify({ success: true, keys });
          }

          case 'get': {
            if (!args.key) {
              return JSON.stringify({ success: false, error: 'key is required for get' });
            }
            const entry = kvFile.entries[args.key];
            if (!entry) {
              return JSON.stringify({ success: false, error: `key not found: ${args.key}` });
            }
            const value = decrypt(entry, key);
            logger.debug('kv get', { key: args.key });
            return JSON.stringify({ success: true, value });
          }

          case 'set': {
            if (!args.key) {
              return JSON.stringify({ success: false, error: 'key is required for set' });
            }
            if (args.value === undefined) {
              return JSON.stringify({ success: false, error: 'value is required for set' });
            }
            kvFile.entries[args.key] = encrypt(args.value, key);
            await saveKvFile(kvStorePath, kvFile);
            logger.debug('kv set', { key: args.key });
            return JSON.stringify({ success: true });
          }

          case 'delete': {
            if (!args.key) {
              return JSON.stringify({ success: false, error: 'key is required for delete' });
            }
            delete kvFile.entries[args.key];
            await saveKvFile(kvStorePath, kvFile);
            logger.debug('kv delete', { key: args.key });
            return JSON.stringify({ success: true });
          }

          default: {
            return JSON.stringify({ success: false, error: `unknown operation: ${args.operation}` });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'kv_store operation failed';
        logger.warn('kv-store error', { error: message });
        return JSON.stringify({ success: false, error: message });
      }
    },
    {
      name: 'kv_store',
      description:
        'Encrypted key-value store. Persist and retrieve secrets or small data across sessions. ' +
        'Operations: get (read a value by key), set (write a value), delete (remove a key), list (all keys).',
      schema: KvStoreSchema,
    },
  );
}
