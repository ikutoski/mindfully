import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Sessions', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('createSessionStore', () => {
    it('should create PostgreSQL session store', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      const { createSessionStore } = await import('../../src/auth/sessions');
      const store = createSessionStore();

      expect(store).toBeDefined();
    });

    it('should reuse existing pool on subsequent calls', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      const { createSessionStore, closeSessionPool } = await import('../../src/auth/sessions');
      const store1 = createSessionStore();
      const store2 = createSessionStore();

      expect(store1).toBeDefined();
      expect(store2).toBeDefined();
      
      await closeSessionPool();
    });
  });

  describe('getSessionConfig', () => {
    it('should return session configuration with defaults', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      delete process.env.SESSION_SECRET;
      process.env.NODE_ENV = 'development';

      const { getSessionConfig, closeSessionPool } = await import('../../src/auth/sessions');
      const config = getSessionConfig();

      expect(config.secret).toBe('dev-secret-change-in-production');
      expect(config.resave).toBe(false);
      expect(config.saveUninitialized).toBe(false);
      expect(config.cookie.httpOnly).toBe(true);
      expect(config.cookie.secure).toBe(false);
      expect(config.cookie.sameSite).toBe('lax');
      expect(config.cookie.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.store).toBeDefined();

      await closeSessionPool();
    });

    it('should use custom session secret from env', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.SESSION_SECRET = 'my-custom-secret';

      const { getSessionConfig, closeSessionPool } = await import('../../src/auth/sessions');
      const config = getSessionConfig();

      expect(config.secret).toBe('my-custom-secret');

      await closeSessionPool();
    });

    it('should set secure cookie in production', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.NODE_ENV = 'production';

      const { getSessionConfig, closeSessionPool } = await import('../../src/auth/sessions');
      const config = getSessionConfig();

      expect(config.cookie.secure).toBe(true);

      await closeSessionPool();
    });
  });

  describe('closeSessionPool', () => {
    it('should close pool if it exists', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      const { createSessionStore, closeSessionPool } = await import('../../src/auth/sessions');
      createSessionStore();
      
      await expect(closeSessionPool()).resolves.not.toThrow();
    });

    it('should handle being called when pool is null', async () => {
      const { closeSessionPool } = await import('../../src/auth/sessions');
      
      await expect(closeSessionPool()).resolves.not.toThrow();
    });
  });
});
