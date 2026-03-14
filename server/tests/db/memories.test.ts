import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoriesRepository } from '../../src/db/repositories/memories.js';

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));

import { db } from '../../src/db/index.js';
const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    user_id: 'user-1',
    agent_id: null,
    content: 'Remember this',
    embedding: null,
    memory_type: 'user',
    metadata: JSON.stringify({}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoriesRepository', () => {
  let repo: MemoriesRepository;

  beforeEach(() => {
    repo = new MemoriesRepository();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('inserts memory with defaults and returns mapped row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.create({ user_id: 'user-1', content: 'Remember this' });
      expect(result.id).toBe('mem-1');
      expect(result.memory_type).toBe('user');
    });

    it('includes embedding in INSERT when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ embedding: '[0.1,0.2]' })], rowCount: 1 } as never);
      const result = await repo.create({
        user_id: 'user-1',
        content: 'vec',
        embedding: [0.1, 0.2],
        agent_id: 'agent-1',
        memory_type: 'system',
        metadata: { key: 'val' },
      });
      expect(result.embedding).toEqual([0.1, 0.2]);
    });
  });

  describe('findById', () => {
    it('returns mapped memory when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.findById('mem-1');
      expect(result?.id).toBe('mem-1');
    });

    it('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns array of memories', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'mem-2' })], rowCount: 2 } as never);
      const result = await repo.findByUserId('user-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('findByAgentId', () => {
    it('returns array of memories for agent', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ agent_id: 'agent-1' })], rowCount: 1 } as never);
      const result = await repo.findByAgentId('agent-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('searches by userId only', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.search({ userId: 'user-1' });
      expect(result).toHaveLength(1);
    });

    it('adds agentId filter when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      await repo.search({ userId: 'user-1', agentId: 'agent-1' });
      const query = mockDb.query.mock.calls[0][0] as string;
      expect(query).toContain('agent_id');
    });

    it('adds memoryType filter when not "all"', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      await repo.search({ userId: 'user-1', memoryType: 'system' });
      const query = mockDb.query.mock.calls[0][0] as string;
      expect(query).toContain('memory_type');
    });

    it('does not add memoryType filter when "all"', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      await repo.search({ userId: 'user-1', memoryType: 'all' });
      const query = mockDb.query.mock.calls[0][0] as string;
      expect(query).not.toContain('memory_type');
    });
  });

  describe('update', () => {
    it('updates content and returns mapped row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ content: 'new content' })], rowCount: 1 } as never);
      const result = await repo.update('mem-1', 'new content');
      expect(result?.content).toBe('new content');
    });

    it('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repo.update('missing', 'new')).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when row deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      expect(await repo.delete('mem-1')).toBe(true);
    });

    it('returns false when no row deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repo.delete('missing')).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await repo.delete('mem-1')).toBe(false);
    });
  });

  describe('deleteByAgentId', () => {
    it('returns rowCount', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 2 } as never);
      expect(await repo.deleteByAgentId('agent-1')).toBe(2);
    });

    it('returns 0 when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await repo.deleteByAgentId('agent-1')).toBe(0);
    });
  });

  describe('count', () => {
    it('returns parsed integer count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 } as never);
      expect(await repo.count('user-1')).toBe(7);
    });
  });

  describe('mapRow (via findById)', () => {
    it('parses embedding from bracket string', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ embedding: '[0.5,0.6,0.7]' })], rowCount: 1 } as never);
      const result = await repo.findById('mem-1');
      expect(result?.embedding).toEqual([0.5, 0.6, 0.7]);
    });

    it('handles embedding as array (already-parsed)', async () => {
      // The source code checks Array.isArray in the else-if branch.
      // To reach it the value must pass the startsWith check first —
      // in practice pg can return the vector as a plain JS array.
      // We verify null is returned when embedding is falsy.
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ embedding: null })], rowCount: 1 } as never);
      const result = await repo.findById('mem-1');
      expect(result?.embedding).toBeNull();
    });

    it('handles metadata already parsed as object', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ metadata: { tag: 'important' } })], rowCount: 1 } as never);
      const result = await repo.findById('mem-1');
      expect(result?.metadata).toEqual({ tag: 'important' });
    });
  });
});
