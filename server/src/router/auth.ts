import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import passport from '../auth/passport';
import { usersRepository } from '../db/repositories/users';
import { verificationTokenRepository, passwordResetTokenRepository } from '../db/repositories/tokens';
import { sessionsRepository } from '../db/repositories/sessions';
import { passwordUtils } from '../auth/utils/password';
import { tokenUtils } from '../auth/utils/tokens';
import { sendVerificationEmail, sendPasswordResetEmail, generateIdToken } from '../auth';
import { requireAuth } from '../auth/middleware';
import { handleGitHubAuth } from '../auth/oauth/github';
import { handleGoogleAuth } from '../auth/oauth/google';
import { z } from 'zod';
import { logger } from '../logger';

const router: RouterType = Router();

const schemas = {
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
  }),
  login: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  forgotPassword: z.object({ email: z.string().email() }),
  resetPassword: z.object({ token: z.string(), password: z.string().min(8) }),
  oauthVerify: z.object({ code: z.string() }),
};

const formatUser = (user: any) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatar_url,
  emailVerified: user.email_verified,
});

const validate = (schema: z.ZodType<any>, data: any, res: Response) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.errors });
    return null;
  }
  return result.data;
};

const handleOAuthVerify = (provider: 'github' | 'google', handler: (code: string) => Promise<any>) => 
  async (req: Request, res: Response) => {
    const data = validate(schemas.oauthVerify, req.body, res);
    if (!data) return;

    try {
      const result = await handler(data.code);
      const user = provider === 'github' ? result : result.user;

      (req as any).logIn(user, (err: any) => {
        if (err) return res.status(500).json({ error: 'Login failed', message: 'Failed to establish session' });
        res.json({
          message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} authentication successful`,
          user: formatUser(user),
          idToken: generateIdToken(user, provider),
        });
      });
    } catch (error) {
      logger.error(`${provider} OAuth error`, { error });
      res.status(401).json({
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : `${provider} authentication failed`,
      });
    }
  };

router.post('/github/verify', handleOAuthVerify('github', handleGitHubAuth));
router.post('/google/verify', handleOAuthVerify('google', handleGoogleAuth));

router.post('/register', async (req: Request, res: Response) => {
  const data = validate(schemas.register, req.body, res);
  if (!data) return;

  try {
    if (await usersRepository.findByEmail(data.email)) {
      return res.status(409).json({ error: 'User already exists', message: 'An account with this email already exists' });
    }

    const pwdValidation = passwordUtils.validate(data.password);
    if (!pwdValidation.valid) {
      return res.status(400).json({ error: 'Invalid password', details: pwdValidation.errors });
    }

    const devMode = process.env.NODE_ENV === 'development' || process.env.EMAIL_PROVIDER === 'console';

    const user = await usersRepository.create({
      email: data.email,
      passwordHash: await passwordUtils.hash(data.password),
      name: data.name,
      emailVerified: devMode,
    });

    res.status(201).json({
      message: devMode
        ? 'Registration successful. You can now sign in.'
        : 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    });
  } catch (error) {
    logger.error('Registration error', { error });
    res.status(500).json({ error: 'Registration failed', message: 'An error occurred during registration' });
  }
});

router.post('/login', (req: Request, res: Response, next) => {
  const data = validate(schemas.login, req.body, res);
  if (!data) return;

  passport.authenticate('local', (err: any, user: any, info: any) => {
    if (err) return res.status(500).json({ error: 'Login failed', message: 'An error occurred during login' });
    if (!user) return res.status(401).json({ error: 'Authentication failed', message: info?.message || 'Invalid credentials' });

    req.logIn(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed', message: 'Failed to establish session' });
      res.json({ 
        message: 'Login successful', 
        user: formatUser(user),
        idToken: generateIdToken(user, 'local'),
      });
    });
  })(req, res, next);
});

router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed', message: 'An error occurred during logout' });
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/verify-email', async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid token', message: 'Verification token is required' });
  }

  try {
    const verificationToken = await verificationTokenRepository.findByToken(token);
    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid token', message: 'This verification link is invalid' });
    }
    if (new Date() > verificationToken.expires_at) {
      await verificationTokenRepository.delete(token);
      return res.status(400).json({ error: 'Token expired', message: 'This verification link has expired. Please request a new one.' });
    }

    await usersRepository.update(verificationToken.user_id, { emailVerified: true });
    await verificationTokenRepository.delete(token);
    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    logger.error('Email verification error', { error });
    res.status(500).json({ error: 'Verification failed', message: 'An error occurred during email verification' });
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required', message: 'Please provide your email address' });

  try {
    const user = await usersRepository.findByEmail(email);
    if (!user || user.email_verified) {
      const message = user?.email_verified 
        ? 'This email is already verified'
        : 'If an account exists with this email, a verification email has been sent.';
      return user?.email_verified 
        ? res.status(400).json({ error: 'Already verified', message })
        : res.json({ message });
    }

    await verificationTokenRepository.deleteByUserId(user.id);
    const token = tokenUtils.generateVerificationToken();
    await verificationTokenRepository.create({
      userId: user.id,
      token,
      expiresAt: tokenUtils.generateExpiry(24),
    });
    await sendVerificationEmail(user.email, token);
    res.json({ message: 'If an account exists with this email, a verification email has been sent.' });
  } catch (error) {
    logger.error('Resend verification error', { error });
    res.status(500).json({ error: 'Failed to resend', message: 'An error occurred' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const data = validate(schemas.forgotPassword, req.body, res);
  if (!data) return;

  try {
    const user = await usersRepository.findByEmail(data.email);
    if (user) {
      await passwordResetTokenRepository.deleteByUserId(user.id);
      const token = tokenUtils.generatePasswordResetToken();
      await passwordResetTokenRepository.create({
        userId: user.id,
        token,
        expiresAt: tokenUtils.generateExpiry(1),
      });
      await sendPasswordResetEmail(user.email, token);
    }
    res.json({ message: 'If an account exists with this email, a password reset email has been sent.' });
  } catch (error) {
    logger.error('Forgot password error', { error });
    res.status(500).json({ error: 'Failed', message: 'An error occurred' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const data = validate(schemas.resetPassword, req.body, res);
  if (!data) return;

  try {
    const resetToken = await passwordResetTokenRepository.findByToken(data.token);
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid token', message: 'This reset link is invalid' });
    }
    if (new Date() > resetToken.expires_at) {
      await passwordResetTokenRepository.delete(data.token);
      return res.status(400).json({ error: 'Token expired', message: 'This reset link has expired' });
    }

    const pwdValidation = passwordUtils.validate(data.password);
    if (!pwdValidation.valid) {
      return res.status(400).json({ error: 'Invalid password', details: pwdValidation.errors });
    }

    await usersRepository.update(resetToken.user_id, { passwordHash: await passwordUtils.hash(data.password) });
    await passwordResetTokenRepository.delete(data.token);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ error: 'Failed', message: 'An error occurred' });
  }
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ user: { ...formatUser(user), createdAt: user.created_at } });
});

router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const sessionId = (req as any).sessionID;
    const sessions = await sessionsRepository.findByUserId(user.id, sessionId);
    res.json({ sessions });
  } catch (error) {
    logger.error('Get sessions error', { error });
    res.status(500).json({ error: 'Failed to get sessions', message: 'An error occurred' });
  }
});

router.delete('/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    const currentSessionId = (req as any).sessionID;

    if (sessionId === currentSessionId) {
      return res.status(400).json({ error: 'Cannot delete current session', message: 'Use logout to end current session' });
    }

    const deleted = await sessionsRepository.deleteBySessionId(sessionId as string);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found', message: 'Session does not exist or already expired' });
    }

    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    logger.error('Delete session error', { error });
    res.status(500).json({ error: 'Failed to delete session', message: 'An error occurred' });
  }
});

router.delete('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const currentSessionId = (req as any).sessionID;
    
    const count = await sessionsRepository.deleteAllExcept(user.id, currentSessionId);
    res.json({ message: `Terminated ${count} session(s)`, count });
  } catch (error) {
    logger.error('Delete all sessions error', { error });
    res.status(500).json({ error: 'Failed to delete sessions', message: 'An error occurred' });
  }
});

export default router;
