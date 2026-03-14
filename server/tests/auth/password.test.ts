import { describe, it, expect } from 'vitest';
import { passwordUtils } from '../../src/auth/utils/password.js';

describe('passwordUtils', () => {
  describe('hash', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await passwordUtils.hash(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await passwordUtils.hash(password);
      const hash2 = await passwordUtils.hash(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash passwords with special characters', async () => {
      const password = 'p@$$w0rd!#$%^&*()';
      const hashedPassword = await passwordUtils.hash(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
    });

    it('should hash passwords with unicode characters', async () => {
      const password = '密码测试123🔐';
      const hashedPassword = await passwordUtils.hash(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
    });
  });

  describe('verify', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await passwordUtils.hash(password);

      const isValid = await passwordUtils.verify(password, hashedPassword);

      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hashedPassword = await passwordUtils.hash(password);

      const isValid = await passwordUtils.verify(wrongPassword, hashedPassword);

      expect(isValid).toBe(false);
    });

    it('should return false for empty password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await passwordUtils.hash(password);

      const isValid = await passwordUtils.verify('', hashedPassword);

      expect(isValid).toBe(false);
    });

    it('should be case sensitive', async () => {
      const password = 'testPassword123';
      const hashedPassword = await passwordUtils.hash(password);

      const isValid = await passwordUtils.verify('TESTPASSWORD123', hashedPassword);

      expect(isValid).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return valid for a password with 8 characters', () => {
      const result = passwordUtils.validate('12345678');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for a password with more than 8 characters', () => {
      const result = passwordUtils.validate('thisIsALongPassword123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for a password with less than 8 characters', () => {
      const result = passwordUtils.validate('1234567');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should return invalid for a password with more than 128 characters', () => {
      const longPassword = 'a'.repeat(129);
      const result = passwordUtils.validate(longPassword);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be less than 128 characters');
    });

    it('should return valid for a password with exactly 128 characters', () => {
      const password = 'a'.repeat(128);
      const result = passwordUtils.validate(password);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for empty password', () => {
      const result = passwordUtils.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should allow special characters in password', () => {
      const result = passwordUtils.validate('p@$$w0rd!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow unicode characters in password', () => {
      const result = passwordUtils.validate('密码测试测试密码');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
