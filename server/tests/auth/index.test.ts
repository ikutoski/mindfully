import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('../../src/email/templates', () => ({
  getVerificationEmailHtml: vi.fn().mockReturnValue('<html>verify</html>'),
  getVerificationEmailText: vi.fn().mockReturnValue('verify text'),
  getPasswordResetEmailHtml: vi.fn().mockReturnValue('<html>reset</html>'),
  getPasswordResetEmailText: vi.fn().mockReturnValue('reset text'),
}));

vi.mock('../../src/auth/strategies/github', () => ({}));
vi.mock('../../src/auth/strategies/google', () => ({}));
vi.mock('../../src/auth/strategies/local', () => ({}));

describe('Auth Index', () => {
  let mockSendEmail: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const email = await import('../../src/email');
    mockSendEmail = email.sendEmail as typeof mockSendEmail;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct parameters', async () => {
      const { sendVerificationEmail } = await import('../../src/auth/index');
      
      await sendVerificationEmail('user@example.com', 'token123', 'John');

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Verify Your Email Address - Mindful',
        html: '<html>verify</html>',
        text: 'verify text',
      });
    });

    it('should send verification email without user name', async () => {
      const { sendVerificationEmail } = await import('../../src/auth/index');
      
      await sendVerificationEmail('test@example.com', 'abc456');

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Verify Your Email Address - Mindful',
        html: '<html>verify</html>',
        text: 'verify text',
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with correct parameters', async () => {
      const { sendPasswordResetEmail } = await import('../../src/auth/index');
      
      await sendPasswordResetEmail('user@example.com', 'resettoken', 'Jane');

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Reset Your Password - Mindful',
        html: '<html>reset</html>',
        text: 'reset text',
      });
    });

    it('should send password reset email without user name', async () => {
      const { sendPasswordResetEmail } = await import('../../src/auth/index');
      
      await sendPasswordResetEmail('reset@example.com', 'xyz789');

      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'reset@example.com',
        subject: 'Reset Your Password - Mindful',
        html: '<html>reset</html>',
        text: 'reset text',
      });
    });
  });
});
