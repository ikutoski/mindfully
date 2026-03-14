import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { oauthAccountRepository, OAuthAccount } from '../../src/db/repositories/oauth.js';

vi.mock('../../src/db/index.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

import { db } from '../../src/db/index.js';

const mockDb = vi.mocked(db);

describe('oauthAccountRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should create an OAuth account', async () => {
      const mockAccount: OAuthAccount = {
        id: 'oauth-123',
        user_id: 'user-123',
        provider: 'github',
        provider_user_id: 'github-456',
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockAccount],
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.create({
        userId: 'user-123',
        provider: 'github',
        providerUserId: 'github-456',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(result).toEqual(mockAccount);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_accounts'),
        ['user-123', 'github', 'github-456', 'access-token', 'refresh-token']
      );
    });

    it('should create an OAuth account without tokens', async () => {
      const mockAccount: OAuthAccount = {
        id: 'oauth-123',
        user_id: 'user-123',
        provider: 'google',
        provider_user_id: 'google-456',
        access_token: null,
        refresh_token: null,
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockAccount],
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.create({
        userId: 'user-123',
        provider: 'google',
        providerUserId: 'google-456',
      });

      expect(result).toEqual(mockAccount);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_accounts'),
        ['user-123', 'google', 'google-456', null, null]
      );
    });
  });

  describe('findByProviderAndId', () => {
    it('should return OAuth account when found', async () => {
      const mockAccount: OAuthAccount = {
        id: 'oauth-123',
        user_id: 'user-123',
        provider: 'github',
        provider_user_id: 'github-456',
        access_token: 'access-token',
        refresh_token: null,
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockAccount],
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.findByProviderAndId('github', 'github-456');

      expect(result).toEqual(mockAccount);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        ['github', 'github-456']
      );
    });

    it('should return null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await oauthAccountRepository.findByProviderAndId('github', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return all OAuth accounts for user', async () => {
      const mockAccounts: OAuthAccount[] = [
        {
          id: 'oauth-123',
          user_id: 'user-123',
          provider: 'github',
          provider_user_id: 'github-456',
          access_token: 'github-token',
          refresh_token: null,
          created_at: new Date(),
        },
        {
          id: 'oauth-124',
          user_id: 'user-123',
          provider: 'google',
          provider_user_id: 'google-456',
          access_token: 'google-token',
          refresh_token: 'refresh-token',
          created_at: new Date(),
        },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockAccounts,
        rowCount: 2,
      } as any);

      const result = await oauthAccountRepository.findByUserId('user-123');

      expect(result).toEqual(mockAccounts);
      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM oauth_accounts WHERE user_id = $1',
        ['user-123']
      );
    });

    it('should return empty array when no accounts found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await oauthAccountRepository.findByUserId('user-123');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('updateTokens', () => {
    it('should update both tokens', async () => {
      const mockAccount: OAuthAccount = {
        id: 'oauth-123',
        user_id: 'user-123',
        provider: 'google',
        provider_user_id: 'google-456',
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockAccount],
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.updateTokens(
        'oauth-123',
        'new-access-token',
        'new-refresh-token'
      );

      expect(result).toEqual(mockAccount);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE oauth_accounts'),
        ['new-access-token', 'new-refresh-token', 'oauth-123']
      );
    });

    it('should update only access token', async () => {
      const mockAccount: OAuthAccount = {
        id: 'oauth-123',
        user_id: 'user-123',
        provider: 'github',
        provider_user_id: 'github-456',
        access_token: 'new-access-token',
        refresh_token: null,
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockAccount],
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.updateTokens('oauth-123', 'new-access-token');

      expect(result).toEqual(mockAccount);
    });

    it('should return null when account not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await oauthAccountRepository.updateTokens('nonexistent', 'token');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when account deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await oauthAccountRepository.delete('oauth-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM oauth_accounts WHERE id = $1',
        ['oauth-123']
      );
    });

    it('should return false when account not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await oauthAccountRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteByUserId', () => {
    it('should return true when accounts deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 2,
      } as any);

      const result = await oauthAccountRepository.deleteByUserId('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM oauth_accounts WHERE user_id = $1',
        ['user-123']
      );
    });

    it('should return false when no accounts found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await oauthAccountRepository.deleteByUserId('nonexistent');

      expect(result).toBe(false);
    });
  });
});
