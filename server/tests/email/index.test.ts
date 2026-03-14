import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Email Service Index', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('initEmailService', () => {
    it('should use ConsoleEmailService when EMAIL_PROVIDER is console', async () => {
      process.env.EMAIL_PROVIDER = 'console';
      process.env.RESEND_API_KEY = 'test-key';
      process.env.EMAIL_FROM = 'test@example.com';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Console');
      expect(service.constructor.name).toBe('ConsoleEmailService');
    });

    it('should use ResendEmailService when EMAIL_PROVIDER is resend and credentials exist', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.EMAIL_FROM = 'noreply@example.com';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Resend');
      expect(service.constructor.name).toBe('ResendEmailService');
    });

    it('should fall back to ConsoleEmailService when Resend credentials missing', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_FROM = 'noreply@example.com';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleWarnSpy).toHaveBeenCalledWith('RESEND_API_KEY or EMAIL_FROM not set, falling back to console');
      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Console');
      expect(service.constructor.name).toBe('ConsoleEmailService');
    });

    it('should use ResendEmailService in production with auto mode', async () => {
      process.env.EMAIL_PROVIDER = 'auto';
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 'prod-key';
      process.env.EMAIL_FROM = 'noreply@company.com';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Resend');
      expect(service.constructor.name).toBe('ResendEmailService');
    });

    it('should use ConsoleEmailService in development with auto mode', async () => {
      process.env.EMAIL_PROVIDER = 'auto';
      process.env.NODE_ENV = 'development';
      process.env.RESEND_API_KEY = 'dev-key';
      process.env.EMAIL_FROM = 'dev@company.com';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Console');
      expect(service.constructor.name).toBe('ConsoleEmailService');
    });

    it('should default to auto mode when EMAIL_PROVIDER is not set', async () => {
      delete process.env.EMAIL_PROVIDER;
      process.env.NODE_ENV = 'development';

      const { initEmailService } = await import('../../src/email/index');
      const service = initEmailService();

      expect(consoleLogSpy).toHaveBeenCalledWith('Email service initialized: Console');
      expect(service.constructor.name).toBe('ConsoleEmailService');
    });
  });

  describe('getEmailService', () => {
    it('should initialize service if not already initialized', async () => {
      process.env.EMAIL_PROVIDER = 'console';
      
      const { getEmailService } = await import('../../src/email/index');
      const service = getEmailService();

      expect(service).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should return cached service on subsequent calls', async () => {
      process.env.EMAIL_PROVIDER = 'console';
      
      const { getEmailService } = await import('../../src/email/index');
      const service1 = getEmailService();
      const service2 = getEmailService();

      expect(service1).toBe(service2);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendEmail', () => {
    it('should delegate to service send method', async () => {
      process.env.EMAIL_PROVIDER = 'console';
      
      const { sendEmail } = await import('../../src/email/index');
      const consoleSpy = vi.spyOn(console, 'log');

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('test@example.com');
      expect(output).toContain('Test');
    });
  });
});
