import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../src/auth/passport', () => ({
  findOrCreateOAuthUser: vi.fn(),
}));

describe('Google OAuth', () => {
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

  describe('verifyGoogleCode', () => {
    it('should throw error when Google OAuth not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      await expect(verifyGoogleCode('code123')).rejects.toThrow('Google OAuth not configured');
    });

    it('should exchange code for token and fetch user profile', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.BASE_URL = 'http://localhost:5173';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-access-token',
            id_token: 'google-id-token',
            refresh_token: 'google-refresh-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-12345',
            email: 'test@gmail.com',
            verified_email: true,
            name: 'Test User',
            picture: 'https://lh3.googleusercontent.com/photo.png',
          }),
        });

      const result = await verifyGoogleCode('valid-code');

      expect(result).toEqual({
        id: 'google-12345',
        email: 'test@gmail.com',
        name: 'Test User',
        avatarUrl: 'https://lh3.googleusercontent.com/photo.png',
        accessToken: 'google-access-token',
        idToken: 'google-id-token',
        refreshToken: 'google-refresh-token',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use default BASE_URL when not set', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      delete process.env.BASE_URL;

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-67890',
            email: 'user@gmail.com',
            verified_email: true,
            name: 'User',
            picture: 'https://photo.url',
          }),
        });

      await verifyGoogleCode('code-no-base-url');

      const tokenCall = mockFetch.mock.calls[0];
      const body = tokenCall[1].body;
      expect(body).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback%2Fgoogle');
    });

    it('should throw error when token exchange fails', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(verifyGoogleCode('invalid-code')).rejects.toThrow(
        'Failed to exchange code for token'
      );
    });

    it('should throw error when Google returns OAuth error', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      });

      await expect(verifyGoogleCode('expired-code')).rejects.toThrow(
        'Invalid authorization code'
      );
    });

    it('should throw error when error_description is missing', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 'access_denied',
        }),
      });

      await expect(verifyGoogleCode('denied-code')).rejects.toThrow('access_denied');
    });

    it('should throw error when user fetch fails', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      await expect(verifyGoogleCode('code-user-fail')).rejects.toThrow(
        'Failed to fetch Google user'
      );
    });

    it('should throw error when user has no email', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-noemail',
            email: null,
            verified_email: false,
            name: 'No Email',
            picture: 'https://photo.url',
          }),
        });

      await expect(verifyGoogleCode('code-no-email')).rejects.toThrow(
        'No email found in Google profile'
      );
    });

    it('should handle user without name', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { verifyGoogleCode } = await import('../../src/auth/oauth/google');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-noname',
            email: 'noname@gmail.com',
            verified_email: true,
            name: null,
            picture: 'https://photo.url',
          }),
        });

      const result = await verifyGoogleCode('code-no-name');

      expect(result.name).toBe(null);
    });
  });

  describe('handleGoogleAuth', () => {
    it('should verify code and create/find OAuth user', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { handleGoogleAuth } = await import('../../src/auth/oauth/google');

      const passport = await import('../../src/auth/passport');
      mockFindOrCreateOAuthUser = passport.findOrCreateOAuthUser as typeof mockFindOrCreateOAuthUser;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
            refresh_token: 'google-refresh',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-99999',
            email: 'google@example.com',
            verified_email: true,
            name: 'Google User',
            picture: 'https://google.photo',
          }),
        });

      const mockUser = { id: 'user-2', email: 'google@example.com' };
      mockFindOrCreateOAuthUser.mockResolvedValue(mockUser);

      const result = await handleGoogleAuth('valid-code');

      expect(result).toEqual({ user: mockUser });
      expect(mockFindOrCreateOAuthUser).toHaveBeenCalledWith(
        'google',
        'google-99999',
        {
          email: 'google@example.com',
          name: 'Google User',
          avatarUrl: 'https://google.photo',
        },
        {
          accessToken: 'google-token',
          refreshToken: 'google-refresh',
        }
      );
    });

    it('should handle user without name', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.resetModules();
      const { handleGoogleAuth } = await import('../../src/auth/oauth/google');

      const passport = await import('../../src/auth/passport');
      mockFindOrCreateOAuthUser = passport.findOrCreateOAuthUser as typeof mockFindOrCreateOAuthUser;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'google-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'google-11111',
            email: 'noname@google.com',
            verified_email: true,
            name: null,
            picture: 'https://photo.url',
          }),
        });

      const mockUser = { id: 'user-3', email: 'noname@google.com' };
      mockFindOrCreateOAuthUser.mockResolvedValue(mockUser);

      const result = await handleGoogleAuth('code-no-name');

      expect(result).toEqual({ user: mockUser });
      expect(mockFindOrCreateOAuthUser).toHaveBeenCalledWith(
        'google',
        'google-11111',
        expect.objectContaining({
          name: undefined,
        }),
        expect.any(Object)
      );
    });
  });
});
