import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentsRepository } from '../../src/db/repositories/agents.js';

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));

import { db } from '../../src/db/index.js';
const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    user_id: 'user-1',
    name: 'Test Agent',
    description: 'A test agent',
    model: 'gpt-4o-mini',
    tools: JSON.stringify([]),
    memory_enabled: false,
    system_prompt: null,
    max_tokens: 4096,
    temperature: '0.7',
    provider_override: null,
    provider_model: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentsRepository', () => {
  let repo: AgentsRepository;

  beforeEach(() => {
    repo = new AgentsRepository();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('inserts agent with defaults and returns mapped row', async () => {
      const row = makeRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.create({ user_id: 'user-1', name: 'Test Agent' });

      expect(mockDb.query).toHaveBeenCalledOnce();
      expect(result.id).toBe('agent-1');
      expect(result.temperature).toBe(0.7);
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('uses provided optional fields', async () => {
      const row = makeRow({ tools: ['search'], memory_enabled: true, system_prompt: 'You are helpful.' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.create({
        user_id: 'user-1',
        name: 'Agent',
        tools: ['search'],
        memory_enabled: true,
        system_prompt: 'You are helpful.',
        model: 'gpt-4o',
        max_tokens: 8192,
        temperature: 0.5,
        provider_override: 'openai',
        provider_model: 'gpt-4o',
      });

      expect(result.memory_enabled).toBe(true);
      expect(result.system_prompt).toBe('You are helpful.');
    });
  });

  describe('findById', () => {
    it('returns mapped agent when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.findById('agent-1');
      expect(result?.id).toBe('agent-1');
    });

    it('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns array of mapped agents', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'agent-2' })], rowCount: 2 } as never);
      const result = await repo.findByUserId('user-1');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when none found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.findByUserId('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('returns null when no fields are provided (calls findById)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.update('agent-1', {});
      expect(result).toBeNull();
    });

    it('updates agent name and returns mapped row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ name: 'Updated' })], rowCount: 1 } as never);
      const result = await repo.update('agent-1', { name: 'Updated' });
      expect(result?.name).toBe('Updated');
    });

    it('updates multiple fields', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.update('agent-1', {
        name: 'New',
        description: 'desc',
        model: 'gpt-4o',
        tools: ['search'],
        memory_enabled: true,
        system_prompt: 'sys',
        max_tokens: 2048,
        temperature: 0.3,
      });
      expect(result).not.toBeNull();
    });

    it('returns null when update finds no row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.update('agent-1', { name: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when row was deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      expect(await repo.delete('agent-1')).toBe(true);
    });

    it('returns false when no row was deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repo.delete('missing')).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await repo.delete('agent-1')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns the parsed integer count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as never);
      expect(await repo.count('user-1')).toBe(5);
    });
  });

  describe('mapRow (via findById)', () => {
    it('handles tools already parsed as array', async () => {
      const row = makeRow({ tools: ['search', 'write'] });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
      const result = await repo.findById('agent-1');
      expect(result?.tools).toEqual(['search', 'write']);
    });
  });
});
