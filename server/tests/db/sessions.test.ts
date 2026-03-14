import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));

import { db } from '../../src/db/index.js';
import { sessionsRepository } from '../../src/db/repositories/sessions.js';

const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
  return {
    sid: 'sid-1',
    sess: JSON.stringify({
      passport: { user: 'user-1' },
      userAgent: 'Mozilla/5.0',
      ip: '127.0.0.1',
      cookie: {
        originalMaxAge: 604800000,
        expires: expires.toISOString(),
      },
    }),
    expire: expires,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findByUserId', () => {
    it('returns mapped active sessions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeSessionRow()], rowCount: 1 } as never);

      const result = await sessionsRepository.findByUserId('user-1', 'other-sid');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sid-1');
      expect(result[0].userAgent).toBe('Mozilla/5.0');
      expect(result[0].ip).toBe('127.0.0.1');
      expect(result[0].isCurrent).toBe(false);
    });

    it('marks session as current when sid matches', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeSessionRow()], rowCount: 1 } as never);
      const result = await sessionsRepository.findByUserId('user-1', 'sid-1');
      expect(result[0].isCurrent).toBe(true);
    });

    it('handles session object already parsed (not a string)', async () => {
      const expires = new Date(Date.now() + 86400000);
      const row = {
        sid: 'sid-2',
        sess: {
          passport: { user: 'user-1' },
          userAgent: 'Chrome',
          ip: '10.0.0.1',
          cookie: { originalMaxAge: 604800000, expires: expires.toISOString() },
        },
        expire: expires,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
      const result = await sessionsRepository.findByUserId('user-1');
      expect(result[0].userAgent).toBe('Chrome');
    });

    it('uses current date when cookie info is missing', async () => {
      const expires = new Date(Date.now() + 86400000);
      const row = {
        sid: 'sid-3',
        sess: JSON.stringify({ passport: { user: 'user-1' } }),
        expire: expires,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
      const result = await sessionsRepository.findByUserId('user-1');
      expect(result[0].userAgent).toBeUndefined();
      expect(result[0].lastActive).toBeInstanceOf(Date);
    });

    it('returns empty array when no sessions found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      const result = await sessionsRepository.findByUserId('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('deleteBySessionId', () => {
    it('returns true when session deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      expect(await sessionsRepository.deleteBySessionId('sid-1')).toBe(true);
    });

    it('returns false when nothing deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await sessionsRepository.deleteBySessionId('missing')).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await sessionsRepository.deleteBySessionId('sid-1')).toBe(false);
    });
  });

  describe('deleteAllExcept', () => {
    it('returns number of deleted sessions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 } as never);
      expect(await sessionsRepository.deleteAllExcept('user-1', 'sid-keep')).toBe(3);
    });

    it('returns 0 when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null } as never);
      expect(await sessionsRepository.deleteAllExcept('user-1', 'sid-keep')).toBe(0);
    });
  });

  describe('countByUserId', () => {
    it('returns parsed count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '4' }], rowCount: 1 } as never);
      expect(await sessionsRepository.countByUserId('user-1')).toBe(4);
    });
  });
});
