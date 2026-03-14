import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentSessionsRepository,
  SessionMessagesRepository,
} from '../../src/db/repositories/agent-sessions.js';

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------

vi.mock('../../src/db/index.js', () => ({
  db: { query: vi.fn() },
}));

import { db } from '../../src/db/index.js';

const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    agent_id: 'agent-1',
    user_id: 'user-1',
    title: null,
    status: 'active',
    summary: null,
    summary_up_to: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockMsgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    session_id: 'sess-1',
    sequence_number: 1,
    role: 'user',
    content: 'Hello',
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    token_count: 5,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AgentSessionsRepository
// ---------------------------------------------------------------------------

describe('AgentSessionsRepository', () => {
  let repo: AgentSessionsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new AgentSessionsRepository();
  });

  describe('create()', () => {
    it('inserts a new session and returns it', async () => {
      const row = mockRow({ title: 'My session' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.create({ agent_id: 'agent-1', user_id: 'user-1', title: 'My session' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['agent-1', 'user-1', 'My session'],
      );
      expect(result.id).toBe('sess-1');
      expect(result.title).toBe('My session');
    });

    it('creates session with null title by default', async () => {
      const row = mockRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      await repo.create({ agent_id: 'agent-1', user_id: 'user-1' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.anything(),
        ['agent-1', 'user-1', null],
      );
    });
  });

  describe('findById()', () => {
    it('returns session when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockRow()], rowCount: 1 } as never);

      const result = await repo.findById('sess-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('sess-1');
    });

    it('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByAgentId()', () => {
    it('returns paginated sessions without cursor', async () => {
      const rows = [mockRow({ id: 's1' }), mockRow({ id: 's2' })];
      mockDb.query.mockResolvedValueOnce({ rows, rowCount: 2 } as never);

      const result = await repo.findByAgentId('agent-1', 10);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('sets nextCursor when there are more pages', async () => {
      // Request 2 items but return 3 rows (indicates hasMore)
      const rows = [
        mockRow({ id: 's1' }),
        mockRow({ id: 's2' }),
        mockRow({ id: 's3' }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows, rowCount: 3 } as never);

      const result = await repo.findByAgentId('agent-1', 2);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('s2');
    });
  });

  describe('update()', () => {
    it('updates title', async () => {
      const row = mockRow({ title: 'New title' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.update('sess-1', { title: 'New title' });
      expect(result?.title).toBe('New title');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agent_sessions'),
        expect.arrayContaining(['New title', 'sess-1']),
      );
    });

    it('calls findById when no fields to update', async () => {
      const row = mockRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      await repo.update('sess-1', {});
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM agent_sessions WHERE id = $1',
        ['sess-1'],
      );
    });
  });

  describe('archive()', () => {
    it('sets status to archived', async () => {
      const row = mockRow({ status: 'archived' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.archive('sess-1');
      expect(result?.status).toBe('archived');
    });
  });
});

// ---------------------------------------------------------------------------
// SessionMessagesRepository
// ---------------------------------------------------------------------------

describe('SessionMessagesRepository', () => {
  let repo: SessionMessagesRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new SessionMessagesRepository();
  });

  describe('create()', () => {
    it('inserts a message and returns it', async () => {
      const row = mockMsgRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      const result = await repo.create({
        session_id: 'sess-1',
        sequence_number: 1,
        role: 'user',
        content: 'Hello',
      });

      expect(result.id).toBe('msg-1');
      expect(result.content).toBe('Hello');
      expect(result.role).toBe('user');
    });

    it('serialises tool_calls as JSON', async () => {
      const row = mockMsgRow({ tool_calls: JSON.stringify([{ name: 'search', args: { q: 'hi' } }]) });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

      await repo.create({
        session_id: 'sess-1',
        sequence_number: 2,
        role: 'assistant',
        content: '',
        tool_calls: [{ name: 'search', args: { q: 'hi' } }],
      });

      const callArgs = mockDb.query.mock.calls[0][1] as unknown[];
      // tool_calls is the 5th param (index 4)
      expect(callArgs[4]).toBe(JSON.stringify([{ name: 'search', args: { q: 'hi' } }]));
    });
  });

  describe('createBatch()', () => {
    it('returns empty array for empty input', async () => {
      const result = await repo.createBatch([]);
      expect(result).toEqual([]);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('creates multiple messages', async () => {
      const row = mockMsgRow();
      mockDb.query.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

      const result = await repo.createBatch([
        { session_id: 'sess-1', sequence_number: 1, role: 'user', content: 'Hi' },
        { session_id: 'sess-1', sequence_number: 2, role: 'assistant', content: 'Hello' },
      ]);

      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('count()', () => {
    it('returns the message count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: 7 }], rowCount: 1 } as never);

      const count = await repo.count('sess-1');
      expect(count).toBe(7);
    });
  });

  describe('nextSequenceNumber()', () => {
    it('returns 1 for empty session', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ next: 1 }], rowCount: 1 } as never);

      const next = await repo.nextSequenceNumber('sess-1');
      expect(next).toBe(1);
    });

    it('returns max + 1 for existing messages', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ next: 6 }], rowCount: 1 } as never);

      const next = await repo.nextSequenceNumber('sess-1');
      expect(next).toBe(6);
    });
  });

  describe('findBySessionId()', () => {
    it('returns paginated messages', async () => {
      const rows = [mockMsgRow({ id: 'm1' }), mockMsgRow({ id: 'm2' })];
      mockDb.query.mockResolvedValueOnce({ rows, rowCount: 2 } as never);

      const result = await repo.findBySessionId('sess-1', 10);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getLastN()', () => {
    it('returns the last N messages in ascending order', async () => {
      const rows = [mockMsgRow({ sequence_number: 3 }), mockMsgRow({ sequence_number: 4 })];
      mockDb.query.mockResolvedValueOnce({ rows, rowCount: 2 } as never);

      const result = await repo.getLastN('sess-1', 2);
      expect(result).toHaveLength(2);
      expect(result[0].sequence_number).toBe(3);
    });
  });
});
