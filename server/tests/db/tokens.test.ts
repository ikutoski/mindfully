import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verificationTokenRepository,
  passwordResetTokenRepository,
  VerificationToken,
} from '../../src/db/repositories/tokens.js';

vi.mock('../../src/db/index.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

import { db } from '../../src/db/index.js';

const mockDb = vi.mocked(db);

describe('verificationTokenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should create a verification token', async () => {
      const mockToken: VerificationToken = {
        id: 'token-123',
        user_id: 'user-123',
        token: 'verification-token-abc',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockToken],
        rowCount: 1,
      } as any);

      const result = await verificationTokenRepository.create({
        userId: 'user-123',
        token: 'verification-token-abc',
        expiresAt: mockToken.expires_at,
      });

      expect(result).toEqual(mockToken);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_verification_tokens'),
        ['user-123', 'verification-token-abc', mockToken.expires_at]
      );
    });
  });

  describe('findByToken', () => {
    it('should return token when found', async () => {
      const mockToken: VerificationToken = {
        id: 'token-123',
        user_id: 'user-123',
        token: 'verification-token-abc',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockToken],
        rowCount: 1,
      } as any);

      const result = await verificationTokenRepository.findByToken('verification-token-abc');

      expect(result).toEqual(mockToken);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM email_verification_tokens WHERE token = $1',
        ['verification-token-abc']
      );
    });

    it('should return null when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await verificationTokenRepository.findByToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when token deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await verificationTokenRepository.delete('verification-token-abc');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM email_verification_tokens WHERE token = $1',
        ['verification-token-abc']
      );
    });

    it('should return false when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await verificationTokenRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteExpired', () => {
    it('should return count of deleted tokens', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 5,
      } as any);

      const result = await verificationTokenRepository.deleteExpired();

      expect(result).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM email_verification_tokens WHERE expires_at < NOW()'
      );
    });

    it('should return 0 when no expired tokens', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await verificationTokenRepository.deleteExpired();

      expect(result).toBe(0);
    });
  });

  describe('deleteByUserId', () => {
    it('should return true when tokens deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await verificationTokenRepository.deleteByUserId('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM email_verification_tokens WHERE user_id = $1',
        ['user-123']
      );
    });

    it('should return false when no tokens found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await verificationTokenRepository.deleteByUserId('nonexistent');

      expect(result).toBe(false);
    });
  });
});

describe('passwordResetTokenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should create a password reset token', async () => {
      const mockToken: VerificationToken = {
        id: 'token-456',
        user_id: 'user-123',
        token: 'reset-token-xyz',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockToken],
        rowCount: 1,
      } as any);

      const result = await passwordResetTokenRepository.create({
        userId: 'user-123',
        token: 'reset-token-xyz',
        expiresAt: mockToken.expires_at,
      });

      expect(result).toEqual(mockToken);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO password_reset_tokens'),
        ['user-123', 'reset-token-xyz', mockToken.expires_at]
      );
    });
  });

  describe('findByToken', () => {
    it('should return token when found', async () => {
      const mockToken: VerificationToken = {
        id: 'token-456',
        user_id: 'user-123',
        token: 'reset-token-xyz',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockToken],
        rowCount: 1,
      } as any);

      const result = await passwordResetTokenRepository.findByToken('reset-token-xyz');

      expect(result).toEqual(mockToken);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM password_reset_tokens WHERE token = $1',
        ['reset-token-xyz']
      );
    });

    it('should return null when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await passwordResetTokenRepository.findByToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when token deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await passwordResetTokenRepository.delete('reset-token-xyz');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE token = $1',
        ['reset-token-xyz']
      );
    });

    it('should return false when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await passwordResetTokenRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteExpired', () => {
    it('should return count of deleted tokens', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 3,
      } as any);

      const result = await passwordResetTokenRepository.deleteExpired();

      expect(result).toBe(3);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW()'
      );
    });

    it('should return 0 when no expired tokens', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await passwordResetTokenRepository.deleteExpired();

      expect(result).toBe(0);
    });
  });

  describe('deleteByUserId', () => {
    it('should return true when tokens deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await passwordResetTokenRepository.deleteByUserId('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        ['user-123']
      );
    });

    it('should return false when no tokens found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await passwordResetTokenRepository.deleteByUserId('nonexistent');

      expect(result).toBe(false);
    });
  });
});
