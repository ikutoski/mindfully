import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('passport', () => ({
  default: {
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    use: vi.fn(),
  },
}));

vi.mock('../../src/db/repositories/users', () => ({
  usersRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../src/db/repositories/oauth', () => ({
  oauthAccountRepository: {
    findByProviderAndId: vi.fn(),
    create: vi.fn(),
    updateTokens: vi.fn(),
  },
}));

describe('Passport Configuration', () => {
  let mockPassport: any;
  let mockUsersRepo: any;
  let mockOAuthRepo: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const passport = await import('passport');
    mockPassport = passport.default;

    const users = await import('../../src/db/repositories/users');
    mockUsersRepo = users.usersRepository;

    const oauth = await import('../../src/db/repositories/oauth');
    mockOAuthRepo = oauth.oauthAccountRepository;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('serializeUser', () => {
    it('should serialize user by id', async () => {
      await import('../../src/auth/passport');
      
      expect(mockPassport.serializeUser).toHaveBeenCalled();
      
      const serializeCallback = mockPassport.serializeUser.mock.calls[0][0];
      const mockDone = vi.fn();
      
      serializeCallback({ id: 'user-123', email: 'test@example.com' }, mockDone);
      
      expect(mockDone).toHaveBeenCalledWith(null, 'user-123');
    });
  });

  describe('deserializeUser', () => {
    it('should deserialize user by id successfully', async () => {
      vi.resetModules();
      
      const passport = await import('passport');
      mockPassport = passport.default;
      
      const users = await import('../../src/db/repositories/users');
      mockUsersRepo = users.usersRepository;
      
      await import('../../src/auth/passport');
      
      const deserializeCallback = mockPassport.deserializeUser.mock.calls[0][0];
      const mockDone = vi.fn();
      
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user-456',
        email: 'deserialized@example.com',
      });
      
      await deserializeCallback('user-456', mockDone);
      
      expect(mockUsersRepo.findById).toHaveBeenCalledWith('user-456');
      expect(mockDone).toHaveBeenCalledWith(null, {
        id: 'user-456',
        email: 'deserialized@example.com',
      });
    });

    it('should return false when user not found', async () => {
      vi.resetModules();
      
      const passport = await import('passport');
      mockPassport = passport.default;
      
      const users = await import('../../src/db/repositories/users');
      mockUsersRepo = users.usersRepository;
      
      await import('../../src/auth/passport');
      
      const deserializeCallback = mockPassport.deserializeUser.mock.calls[0][0];
      const mockDone = vi.fn();
      
      mockUsersRepo.findById.mockResolvedValue(null);
      
      await deserializeCallback('nonexistent', mockDone);
      
      expect(mockDone).toHaveBeenCalledWith(null, false);
    });

    it('should handle errors during deserialization', async () => {
      vi.resetModules();
      
      const passport = await import('passport');
      mockPassport = passport.default;
      
      const users = await import('../../src/db/repositories/users');
      mockUsersRepo = users.usersRepository;
      
      await import('../../src/auth/passport');
      
      const deserializeCallback = mockPassport.deserializeUser.mock.calls[0][0];
      const mockDone = vi.fn();
      
      const error = new Error('Database error');
      mockUsersRepo.findById.mockRejectedValue(error);
      
      await deserializeCallback('user-789', mockDone);
      
      expect(mockDone).toHaveBeenCalledWith(error, null);
    });
  });

  describe('findOrCreateOAuthUser', () => {
    it('should return existing user when OAuth account exists', async () => {
      const { findOrCreateOAuthUser } = await import('../../src/auth/passport');
      
      const mockUser = { id: 'user-1', email: 'existing@example.com' };
      const mockOAuthAccount = { id: 'oauth-1', user_id: 'user-1' };
      
      mockOAuthRepo.findByProviderAndId.mockResolvedValue(mockOAuthAccount);
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      mockOAuthRepo.updateTokens.mockResolvedValue(undefined);
      
      const result = await findOrCreateOAuthUser(
        'github',
        'github-123',
        { email: 'existing@example.com', name: 'User' },
        { accessToken: 'token123', refreshToken: 'refresh123' }
      );
      
      expect(mockOAuthRepo.findByProviderAndId).toHaveBeenCalledWith('github', 'github-123');
      expect(mockOAuthRepo.updateTokens).toHaveBeenCalledWith('oauth-1', 'token123', 'refresh123');
      expect(mockUsersRepo.findById).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should throw error when user not found for existing OAuth account', async () => {
      const { findOrCreateOAuthUser } = await import('../../src/auth/passport');
      
      const mockOAuthAccount = { id: 'oauth-2', user_id: 'nonexistent-user' };
      
      mockOAuthRepo.findByProviderAndId.mockResolvedValue(mockOAuthAccount);
      mockUsersRepo.findById.mockResolvedValue(null);
      
      await expect(
        findOrCreateOAuthUser('google', 'google-456', { email: 'test@example.com' })
      ).rejects.toThrow('User not found for existing OAuth account');
    });

    it('should create new user when no existing user or OAuth account', async () => {
      const { findOrCreateOAuthUser } = await import('../../src/auth/passport');
      
      mockOAuthRepo.findByProviderAndId.mockResolvedValue(null);
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      
      const newUser = { id: 'new-user', email: 'new@example.com', email_verified: true };
      mockUsersRepo.create.mockResolvedValue(newUser);
      mockOAuthRepo.create.mockResolvedValue({ id: 'new-oauth' });
      
      const result = await findOrCreateOAuthUser(
        'github',
        'github-new',
        { email: 'new@example.com', name: 'New User', avatarUrl: 'https://avatar.url' },
        { accessToken: 'new-token' }
      );
      
      expect(mockUsersRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
      });
      
      expect(mockOAuthRepo.create).toHaveBeenCalledWith({
        userId: 'new-user',
        provider: 'github',
        providerUserId: 'github-new',
        accessToken: 'new-token',
        refreshToken: undefined,
      });
      
      expect(result).toEqual(newUser);
    });

    it('should update email_verified for existing user', async () => {
      const { findOrCreateOAuthUser } = await import('../../src/auth/passport');
      
      const existingUser = { id: 'existing-user', email: 'existing@example.com', email_verified: false };
      
      mockOAuthRepo.findByProviderAndId.mockResolvedValue(null);
      mockUsersRepo.findByEmail.mockResolvedValue(existingUser);
      mockUsersRepo.update.mockResolvedValue({ ...existingUser, email_verified: true });
      mockOAuthRepo.create.mockResolvedValue({ id: 'oauth-3' });
      
      const result = await findOrCreateOAuthUser(
        'google',
        'google-new',
        { email: 'existing@example.com' }
      );
      
      expect(mockUsersRepo.update).toHaveBeenCalledWith('existing-user', {
        emailVerified: true,
      });
      expect(result.email_verified).toBe(true);
    });

    it('should not update tokens when accessToken not provided', async () => {
      const { findOrCreateOAuthUser } = await import('../../src/auth/passport');
      
      const mockUser = { id: 'user-2', email: 'user2@example.com' };
      const mockOAuthAccount = { id: 'oauth-4', user_id: 'user-2' };
      
      mockOAuthRepo.findByProviderAndId.mockResolvedValue(mockOAuthAccount);
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      
      const result = await findOrCreateOAuthUser(
        'github',
        'github-456',
        { email: 'user2@example.com' },
        { refreshToken: 'refresh-only' }
      );
      
      expect(mockOAuthRepo.updateTokens).not.toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });
  });
});
