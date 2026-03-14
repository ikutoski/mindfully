import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateIdToken, verifyIdToken } from '../../src/auth/utils/id-token.js';
import jwt from 'jsonwebtoken';

describe('id-token', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-jwt-secret-key-for-testing',
      BASE_URL: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('generateIdToken', () => {
    it('should generate a valid JWT token', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        email_verified: true,
      };

      const token = generateIdToken(user, 'github');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should include user data in token payload', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        email_verified: true,
      };

      const token = generateIdToken(user, 'github');
      const decoded = jwt.decode(token) as any;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.name).toBe(user.name);
      expect(decoded.avatarUrl).toBe(user.avatar_url);
      expect(decoded.emailVerified).toBe(user.email_verified);
      expect(decoded.provider).toBe('github');
    });

    it('should include issuer and audience', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      const token = generateIdToken(user, 'google');
      const decoded = jwt.decode(token) as any;

      expect(decoded.iss).toBe('http://localhost:3000');
      expect(decoded.aud).toBe('mindful-app');
    });

    it('should set expiration to 1 hour', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        avatar_url: null,
        email_verified: false,
      };

      const _now = Math.floor(Date.now() / 1000);
      const token = generateIdToken(user, 'github');
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp - decoded.iat).toBe(3600); // 1 hour in seconds
    });

    it('should throw error when JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;
      delete process.env.SESSION_SECRET;

      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      expect(() => generateIdToken(user, 'github')).toThrow(
        'JWT_SECRET or SESSION_SECRET must be set'
      );
    });

    it('should use SESSION_SECRET as fallback', () => {
      delete process.env.JWT_SECRET;
      process.env.SESSION_SECRET = 'session-secret-fallback';

      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      const token = generateIdToken(user, 'github');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyIdToken', () => {
    it('should verify and return payload for valid token', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        email_verified: true,
      };

      const token = generateIdToken(user, 'github');
      const payload = verifyIdToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(user.id);
      expect(payload?.email).toBe(user.email);
      expect(payload?.name).toBe(user.name);
      expect(payload?.avatarUrl).toBe(user.avatar_url);
      expect(payload?.emailVerified).toBe(user.email_verified);
      expect(payload?.provider).toBe('github');
    });

    it('should return null for invalid token', () => {
      const payload = verifyIdToken('invalid-token');

      expect(payload).toBeNull();
    });

    it('should return null for token with wrong audience', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      // Generate token with wrong audience
      const token = jwt.sign(
        {
          iss: 'http://localhost:3000',
          sub: user.id,
          aud: 'wrong-audience',
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          emailVerified: user.email_verified,
          provider: 'github',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        process.env.JWT_SECRET!
      );

      const payload = verifyIdToken(token);

      expect(payload).toBeNull();
    });

    it('should return null for expired token', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      // Generate expired token
      const token = jwt.sign(
        {
          iss: 'http://localhost:3000',
          sub: user.id,
          aud: 'mindful-app',
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          emailVerified: user.email_verified,
          provider: 'github',
          iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        },
        process.env.JWT_SECRET!
      );

      const payload = verifyIdToken(token);

      expect(payload).toBeNull();
    });

    it('should return null when JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;
      delete process.env.SESSION_SECRET;

      const payload = verifyIdToken('any-token');

      expect(payload).toBeNull();
    });

    it('should return null for token signed with different secret', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
      };

      // Generate token with different secret
      const token = jwt.sign(
        {
          iss: 'http://localhost:3000',
          sub: user.id,
          aud: 'mindful-app',
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          emailVerified: user.email_verified,
          provider: 'github',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        'different-secret'
      );

      const payload = verifyIdToken(token);

      expect(payload).toBeNull();
    });
  });
});
