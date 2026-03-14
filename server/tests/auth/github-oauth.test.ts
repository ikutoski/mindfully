import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../src/auth/passport', () => ({
  findOrCreateOAuthUser: vi.fn(),
}));

describe('GitHub OAuth', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockFindOrCreateOAuthUser: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    mockFetch.mockReset();

    const passport = await import('../../src/auth/passport');
    mockFindOrCreateOAuthUser = passport.findOrCreateOAuthUser as typeof mockFindOrCreateOAuthUser;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('verifyGitHubCode', () => {
    it('should throw error when GitHub OAuth not configured', async () => {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      await expect(verifyGitHubCode('code123')).rejects.toThrow('GitHub OAuth not configured');
    });

    it('should exchange code for token and fetch user profile', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-access-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            email: 'test@example.com',
            name: 'Test User',
            avatar_url: 'https://avatar.url/test.png',
          }),
        });

      const result = await verifyGitHubCode('valid-code');

      expect(result).toEqual({
        id: '12345',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://avatar.url/test.png',
        accessToken: 'gh-access-token',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            code: 'valid-code',
          }),
        })
      );
    });

    it('should fetch primary email when user email is null', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 67890,
            login: 'noemailuser',
            email: null,
            name: 'No Email',
            avatar_url: 'https://avatar.url/noemail.png',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'secondary@example.com', primary: false, verified: true },
            { email: 'primary@example.com', primary: true, verified: true },
          ],
        });

      const result = await verifyGitHubCode('code-without-email');

      expect(result.email).toBe('primary@example.com');
    });

    it('should use first verified email when no primary email', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 11111,
            login: 'user',
            email: null,
            name: null,
            avatar_url: 'https://avatar.url/user.png',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'first@example.com', primary: false, verified: true },
            { email: 'second@example.com', primary: false, verified: true },
          ],
        });

      const result = await verifyGitHubCode('code-no-primary');

      expect(result.email).toBe('first@example.com');
      expect(result.name).toBe('user');
    });

    it('should throw error when no verified email found', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 22222,
            login: 'noverified',
            email: null,
            name: 'No Verified',
            avatar_url: 'https://avatar.url/noverified.png',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'unverified@example.com', primary: true, verified: false },
          ],
        });

      await expect(verifyGitHubCode('code-no-verified')).rejects.toThrow(
        'No verified email found in GitHub profile'
      );
    });

    it('should throw error when token exchange fails', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(verifyGitHubCode('invalid-code')).rejects.toThrow(
        'Failed to exchange code for token'
      );
    });

    it('should throw error when GitHub returns OAuth error', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        }),
      });

      await expect(verifyGitHubCode('expired-code')).rejects.toThrow(
        'The code passed is incorrect or expired.'
      );
    });

    it('should throw error when user fetch fails', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGitHubCode } = await import('../../src/auth/oauth/github');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      await expect(verifyGitHubCode('code-user-fail')).rejects.toThrow(
        'Failed to fetch GitHub user'
      );
    });
  });

  describe('handleGitHubAuth', () => {
    it('should verify code and create/find OAuth user', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { handleGitHubAuth } = await import('../../src/auth/oauth/github');

      const passport = await import('../../src/auth/passport');
      mockFindOrCreateOAuthUser = passport.findOrCreateOAuthUser as typeof mockFindOrCreateOAuthUser;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token', token_type: 'bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 99999,
            login: 'githubuser',
            email: 'github@example.com',
            name: 'GitHub User',
            avatar_url: 'https://avatar.url/github.png',
          }),
        });

      const mockUser = { id: 'user-1', email: 'github@example.com' };
      mockFindOrCreateOAuthUser.mockResolvedValue(mockUser);

      const result = await handleGitHubAuth('valid-code');

      expect(result).toEqual(mockUser);
      expect(mockFindOrCreateOAuthUser).toHaveBeenCalledWith(
        'github',
        '99999',
        {
          email: 'github@example.com',
          name: 'GitHub User',
          avatarUrl: 'https://avatar.url/github.png',
        },
        {
          accessToken: 'gh-token',
        }
      );
    });
  });
});
