import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionsRepository } from '../../src/db/repositories/executions.js';

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));

import { db } from '../../src/db/index.js';
const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    agent_id: 'agent-1',
    input: 'hello',
    output: JSON.stringify({}),
    status: 'pending',
    error: null,
    token_usage: JSON.stringify({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    started_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionsRepository', () => {
  let repo: ExecutionsRepository;

  beforeEach(() => {
    repo = new ExecutionsRepository();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('inserts execution and returns mapped row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);

      const result = await repo.create({ agent_id: 'agent-1', input: 'hello' });

      expect(result.id).toBe('exec-1');
      expect(result.status).toBe('pending');
      expect(result.token_usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    });
  });

  describe('findById', () => {
    it('returns mapped execution when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 } as never);
      const result = await repo.findById('exec-1');
      expect(result?.id).toBe('exec-1');
    });

    it('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByAgentId', () => {
    it('returns array of executions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'exec-2' })], rowCount: 2 } as never);
      const result = await repo.findByAgentId('agent-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('returns null (calls findById) when no fields given', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.update('exec-1', {});
      expect(result).toBeNull();
    });

    it('updates status and returns mapped row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeRow({ status: 'running' })], rowCount: 1 } as never);
      const result = await repo.update('exec-1', { status: 'running' });
      expect(result?.status).toBe('running');
    });

    it('updates multiple fields including all optional ones', async () => {
      const completedRow = makeRow({ status: 'completed', completed_at: new Date().toISOString() });
      mockDb.query.mockResolvedValueOnce({ rows: [completedRow], rowCount: 1 } as never);

      const result = await repo.update('exec-1', {
        output: { answer: 42 },
        status: 'completed',
        error: 'some error',
        token_usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        completed_at: new Date(),
      });

      expect(result?.status).toBe('completed');
    });

    it('returns null when update finds no row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await repo.update('exec-1', { status: 'failed' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when row deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      expect(await repo.delete('exec-1')).toBe(true);
    });

    it('returns false when no row deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repo.delete('missing')).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await repo.delete('exec-1')).toBe(false);
    });
  });

  describe('deleteByAgentId', () => {
    it('returns rowCount', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 } as never);
      expect(await repo.deleteByAgentId('agent-1')).toBe(3);
    });

    it('returns 0 when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await repo.deleteByAgentId('agent-1')).toBe(0);
    });
  });

  describe('linkSession', () => {
    it('calls UPDATE query with session and execution ids', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      await repo.linkSession('exec-1', 'sess-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agent_executions SET session_id'),
        ['sess-1', 'exec-1'],
      );
    });
  });

  describe('mapRow (via findById)', () => {
    it('handles output and token_usage already parsed as objects', async () => {
      const row = makeRow({
        output: { answer: 1 },
        token_usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        completed_at: new Date().toISOString(),
      });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
      const result = await repo.findById('exec-1');
      expect(result?.token_usage.totalTokens).toBe(3);
      expect(result?.completed_at).not.toBeNull();
    });
  });
});
