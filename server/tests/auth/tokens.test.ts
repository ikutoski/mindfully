import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tokenUtils } from '../../src/auth/utils/tokens.js';

describe('tokenUtils', () => {
  describe('generate', () => {
    it('should generate a token with default length of 32 bytes (64 hex chars)', () => {
      const token = tokenUtils.generate();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate a token with custom length', () => {
      const token = tokenUtils.generate(16);

      expect(token.length).toBe(32); // 16 bytes = 32 hex characters
    });

    it('should generate unique tokens', () => {
      const token1 = tokenUtils.generate();
      const token2 = tokenUtils.generate();

      expect(token1).not.toBe(token2);
    });

    it('should only contain hex characters', () => {
      const token = tokenUtils.generate();
      const hexRegex = /^[0-9a-f]+$/;

      expect(hexRegex.test(token)).toBe(true);
    });
  });

  describe('generateVerificationToken', () => {
    it('should generate a verification token', () => {
      const token = tokenUtils.generateVerificationToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate unique verification tokens', () => {
      const token1 = tokenUtils.generateVerificationToken();
      const token2 = tokenUtils.generateVerificationToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('generatePasswordResetToken', () => {
    it('should generate a password reset token', () => {
      const token = tokenUtils.generatePasswordResetToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate unique password reset tokens', () => {
      const token1 = tokenUtils.generatePasswordResetToken();
      const token2 = tokenUtils.generatePasswordResetToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('generateExpiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate expiry date with default 24 hours', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const expiresAt = tokenUtils.generateExpiry();

      expect(expiresAt.toISOString()).toBe('2024-01-02T12:00:00.000Z');
    });

    it('should generate expiry date with custom hours', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const expiresAt = tokenUtils.generateExpiry(1);

      expect(expiresAt.toISOString()).toBe('2024-01-01T13:00:00.000Z');
    });

    it('should generate expiry date with 48 hours', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const expiresAt = tokenUtils.generateExpiry(48);

      expect(expiresAt.toISOString()).toBe('2024-01-03T12:00:00.000Z');
    });

    it('should handle 0 hours', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const expiresAt = tokenUtils.generateExpiry(0);

      expect(expiresAt.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    });
  });
});
