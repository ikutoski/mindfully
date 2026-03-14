import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('pg', () => {
  const mockPool = {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: {
      Pool: vi.fn().mockImplementation(() => mockPool),
    },
  };
});

describe('Database', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockPool: { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    const pkg = await import('pg');
    mockPool = new (pkg.default as any).Pool();
    
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('db.query', () => {
    it('should execute query', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      
      const { db } = await import('../../src/db/index');
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const _result = await db.query('SELECT * FROM users WHERE id = $1', ['1']);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['1']);
    });
  });

  describe('db.end', () => {
    it('should close pool connection', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      
      const { db } = await import('../../src/db/index');
      await db.end();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('db.healthCheck', () => {
    it('should return true when database is healthy', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      
      const { db } = await import('../../src/db/index');
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await db.healthCheck();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
      expect(result).toBe(true);
    });

    it('should return false and log error when database is unhealthy', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      
      const { db } = await import('../../src/db/index');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValue(error);

      const result = await db.healthCheck();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Database health check failed:', error);
      
      consoleErrorSpy.mockRestore();
    });
  });
});
