import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/auth/passport', () => ({
  default: {
    authenticate: vi.fn(),
  },
}));

vi.mock('../../src/db/repositories/users', () => ({
  usersRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../src/db/repositories/tokens', () => ({
  verificationTokenRepository: {
    findByToken: vi.fn(),
    delete: vi.fn(),
    deleteByUserId: vi.fn(),
    create: vi.fn(),
  },
  passwordResetTokenRepository: {
    findByToken: vi.fn(),
    delete: vi.fn(),
    deleteByUserId: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../src/auth/utils/password', () => ({
  passwordUtils: {
    hash: vi.fn(),
    verify: vi.fn(),
    validate: vi.fn(),
  },
}));

vi.mock('../../src/auth/utils/tokens', () => ({
  tokenUtils: {
    generateVerificationToken: vi.fn(),
    generatePasswordResetToken: vi.fn(),
    generateExpiry: vi.fn(),
  },
}));

vi.mock('../../src/auth', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  generateIdToken: vi.fn(),
}));

vi.mock('../../src/auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  },
}));

vi.mock('../../src/auth/oauth/github', () => ({
  handleGitHubAuth: vi.fn(),
}));

vi.mock('../../src/auth/oauth/google', () => ({
  handleGoogleAuth: vi.fn(),
}));

describe('Auth Router', () => {
  let app: express.Application;
  let mockUsersRepo: any;
  let mockVerificationTokenRepo: any;
  let mockPasswordResetTokenRepo: any;
  let mockPasswordUtils: any;
  let mockTokenUtils: any;
  let mockSendVerificationEmail: any;
  let mockSendPasswordResetEmail: any;
  let mockGenerateIdToken: any;
  let mockHandleGitHubAuth: any;
  let mockHandleGoogleAuth: any;
  let mockPassport: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    const users = await import('../../src/db/repositories/users');
    mockUsersRepo = users.usersRepository;
    
    const tokens = await import('../../src/db/repositories/tokens');
    mockVerificationTokenRepo = tokens.verificationTokenRepository;
    mockPasswordResetTokenRepo = tokens.passwordResetTokenRepository;
    
    const password = await import('../../src/auth/utils/password');
    mockPasswordUtils = password.passwordUtils;
    
    const tokenUtils = await import('../../src/auth/utils/tokens');
    mockTokenUtils = tokenUtils.tokenUtils;
    
    const auth = await import('../../src/auth');
    mockSendVerificationEmail = auth.sendVerificationEmail;
    mockSendPasswordResetEmail = auth.sendPasswordResetEmail;
    mockGenerateIdToken = auth.generateIdToken;
    
    const github = await import('../../src/auth/oauth/github');
    mockHandleGitHubAuth = github.handleGitHubAuth;
    
    const google = await import('../../src/auth/oauth/google');
    mockHandleGoogleAuth = google.handleGoogleAuth;
    
    const passport = await import('../../src/auth/passport');
    mockPassport = passport.default;
    
    const authRouter = (await import('../../src/router/auth')).default;
    app.use('/auth', authRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockPasswordUtils.validate.mockReturnValue({ valid: true, errors: [] });
      mockPasswordUtils.hash.mockResolvedValue('hashed-password');
      mockUsersRepo.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        name: 'New User',
        email_verified: false,
      });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'ValidPass123!',
          name: 'New User',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('Registration successful');
      expect(response.body.userId).toBe('user-1');
      expect(mockUsersRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        passwordHash: 'hashed-password',
        name: 'New User',
        emailVerified: false,
      });
    });

    it('should return 409 when user already exists', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
      });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'ValidPass123!',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User already exists');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'ValidPass123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for short password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for weak password', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockPasswordUtils.validate.mockReturnValue({
        valid: false,
        errors: ['Password must contain uppercase letter'],
      });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weakpassword',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid password');
    });

    it('should register user without name', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockPasswordUtils.validate.mockReturnValue({ valid: true, errors: [] });
      mockPasswordUtils.hash.mockResolvedValue('hashed-password');
      mockUsersRepo.create.mockResolvedValue({
        id: 'user-2',
        email: 'noname@example.com',
        name: null,
        email_verified: false,
      });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'noname@example.com',
          password: 'ValidPass123!',
        });

      expect(response.status).toBe(201);
      expect(mockUsersRepo.create).toHaveBeenCalledWith({
        email: 'noname@example.com',
        passwordHash: 'hashed-password',
        name: undefined,
        emailVerified: false,
      });
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        email_verified: true,
      };

      mockPassport.authenticate.mockImplementation((strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, mockUser, null);
        };
      });

      const sessionApp = express();
      sessionApp.use(express.json());
      sessionApp.use((req: any, res, next) => {
        req.logIn = vi.fn().mockImplementation((user: any, cb: any) => cb(null));
        next();
      });

      const authRouter = (await import('../../src/router/auth')).default;
      sessionApp.use('/auth', authRouter);

      const response = await request(sessionApp)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'CorrectPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('user@example.com');
    });

    it('should return 401 for invalid credentials', async () => {
      mockPassport.authenticate.mockImplementation((strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Invalid credentials' });
        };
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'WrongPassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: 'SomePassword',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle authentication error', async () => {
      mockPassport.authenticate.mockImplementation((strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(new Error('Auth error'), null, null);
        };
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'SomePassword',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Login failed');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const sessionApp = express();
      sessionApp.use(express.json());
      sessionApp.use((req: any, res, next) => {
        req.logout = vi.fn().mockImplementation((cb: any) => cb(null));
        next();
      });

      const authRouter = (await import('../../src/router/auth')).default;
      sessionApp.use('/auth', authRouter);

      const response = await request(sessionApp).post('/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');
    });
  });

  describe('GET /auth/verify-email', () => {
    it('should verify email successfully', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      mockVerificationTokenRepo.findByToken.mockResolvedValue({
        id: 'token-1',
        user_id: 'user-1',
        token: 'valid-token',
        expires_at: futureDate,
      });
      mockUsersRepo.update.mockResolvedValue({ id: 'user-1', email_verified: true });
      mockVerificationTokenRepo.delete.mockResolvedValue(undefined);

      const response = await request(app)
        .get('/auth/verify-email?token=valid-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Email verified successfully');
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user-1', { emailVerified: true });
      expect(mockVerificationTokenRepo.delete).toHaveBeenCalledWith('valid-token');
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app)
        .get('/auth/verify-email');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 400 for invalid token', async () => {
      mockVerificationTokenRepo.findByToken.mockResolvedValue(null);

      const response = await request(app)
        .get('/auth/verify-email?token=invalid-token');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 400 for expired token', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockVerificationTokenRepo.findByToken.mockResolvedValue({
        id: 'token-2',
        user_id: 'user-2',
        token: 'expired-token',
        expires_at: pastDate,
      });
      mockVerificationTokenRepo.delete.mockResolvedValue(undefined);

      const response = await request(app)
        .get('/auth/verify-email?token=expired-token');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token expired');
      expect(mockVerificationTokenRepo.delete).toHaveBeenCalledWith('expired-token');
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('should resend verification email successfully', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'unverified@example.com',
        email_verified: false,
      });
      mockVerificationTokenRepo.deleteByUserId.mockResolvedValue(undefined);
      mockTokenUtils.generateVerificationToken.mockReturnValue('new-token');
      mockTokenUtils.generateExpiry.mockReturnValue(new Date());
      mockVerificationTokenRepo.create.mockResolvedValue(undefined);
      mockSendVerificationEmail.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'unverified@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('verification email has been sent');
      expect(mockSendVerificationEmail).toHaveBeenCalled();
    });

    it('should return generic message when user not found', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('verification email has been sent');
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should return 400 when email is already verified', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'verified@example.com',
        email_verified: true,
      });

      const response = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'verified@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Already verified');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/auth/resend-verification')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email required');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send password reset email for existing user', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });
      mockPasswordResetTokenRepo.deleteByUserId.mockResolvedValue(undefined);
      mockTokenUtils.generatePasswordResetToken.mockReturnValue('reset-token');
      mockTokenUtils.generateExpiry.mockReturnValue(new Date());
      mockPasswordResetTokenRepo.create.mockResolvedValue(undefined);
      mockSendPasswordResetEmail.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('password reset email has been sent');
      expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('user@example.com', 'reset-token');
    });

    it('should return generic message for non-existent user', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('password reset email has been sent');
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password successfully', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      mockPasswordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'token-1',
        user_id: 'user-1',
        token: 'valid-reset-token',
        expires_at: futureDate,
      });
      mockPasswordUtils.validate.mockReturnValue({ valid: true, errors: [] });
      mockPasswordUtils.hash.mockResolvedValue('new-hashed-password');
      mockUsersRepo.update.mockResolvedValue({ id: 'user-1' });
      mockPasswordResetTokenRepo.delete.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          password: 'NewValidPass123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Password reset successfully');
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user-1', {
        passwordHash: 'new-hashed-password',
      });
      expect(mockPasswordResetTokenRepo.delete).toHaveBeenCalledWith('valid-reset-token');
    });

    it('should return 400 for invalid token', async () => {
      mockPasswordResetTokenRepo.findByToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewValidPass123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 400 for expired token', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockPasswordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'token-2',
        user_id: 'user-2',
        token: 'expired-reset-token',
        expires_at: pastDate,
      });
      mockPasswordResetTokenRepo.delete.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'expired-reset-token',
          password: 'NewValidPass123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token expired');
    });

    it('should return 400 for weak password', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      mockPasswordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'token-3',
        user_id: 'user-3',
        token: 'valid-token',
        expires_at: futureDate,
      });
      mockPasswordUtils.validate.mockReturnValue({
        valid: false,
        errors: ['Password too short'],
      });

      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'valid-token',
          password: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'some-token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user when authenticated', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        avatar_url: 'https://avatar.url',
        email_verified: true,
        created_at: new Date('2024-01-01'),
      };

      const authApp = express();
      authApp.use(express.json());
      authApp.use((req: any, res, next) => {
        req.isAuthenticated = () => true;
        req.user = mockUser;
        next();
      });

      const authRouter = (await import('../../src/router/auth')).default;
      authApp.use('/auth', authRouter);

      const response = await request(authApp).get('/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe('user-1');
      expect(response.body.user.email).toBe('user@example.com');
      expect(response.body.user.name).toBe('Test User');
      expect(response.body.user.emailVerified).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /auth/github/verify', () => {
    it('should authenticate with GitHub successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'github@example.com',
        name: 'GitHub User',
        avatar_url: 'https://github.avatar',
        email_verified: true,
      };

      mockHandleGitHubAuth.mockResolvedValue(mockUser);
      mockGenerateIdToken.mockReturnValue('id-token-123');

      const sessionApp = express();
      sessionApp.use(express.json());
      sessionApp.use((req: any, res, next) => {
        req.logIn = vi.fn().mockImplementation((user: any, cb: any) => cb(null));
        next();
      });

      const authRouter = (await import('../../src/router/auth')).default;
      sessionApp.use('/auth', authRouter);

      const response = await request(sessionApp)
        .post('/auth/github/verify')
        .send({ code: 'github-code' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('authentication successful');
      expect(response.body.user.email).toBe('github@example.com');
      expect(response.body.idToken).toBe('id-token-123');
    });

    it('should return 401 for invalid GitHub code', async () => {
      mockHandleGitHubAuth.mockRejectedValue(new Error('Invalid code'));

      const response = await request(app)
        .post('/auth/github/verify')
        .send({ code: 'invalid-code' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app)
        .post('/auth/github/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/google/verify', () => {
    it('should authenticate with Google successfully', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'google@example.com',
        name: 'Google User',
        avatar_url: 'https://google.avatar',
        email_verified: true,
      };

      mockHandleGoogleAuth.mockResolvedValue({ user: mockUser });
      mockGenerateIdToken.mockReturnValue('id-token-456');

      const sessionApp = express();
      sessionApp.use(express.json());
      sessionApp.use((req: any, res, next) => {
        req.logIn = vi.fn().mockImplementation((user: any, cb: any) => cb(null));
        next();
      });

      const authRouter = (await import('../../src/router/auth')).default;
      sessionApp.use('/auth', authRouter);

      const response = await request(sessionApp)
        .post('/auth/google/verify')
        .send({ code: 'google-code' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Google authentication successful');
      expect(response.body.user.email).toBe('google@example.com');
      expect(response.body.idToken).toBe('id-token-456');
    });

    it('should return 401 for invalid Google code', async () => {
      mockHandleGoogleAuth.mockRejectedValue(new Error('Invalid Google code'));

      const response = await request(app)
        .post('/auth/google/verify')
        .send({ code: 'invalid-code' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app)
        .post('/auth/google/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });
});
