import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResendEmailService } from '../../src/email/resend';
import type { EmailData } from '../../src/email/console';

const mockSend = vi.fn();

vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: mockSend,
      },
    })),
  };
});

describe('ResendEmailService', () => {
  let service: ResendEmailService;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const testEmailData: EmailData = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test HTML</p>',
    text: 'Test text',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSend.mockReset();
    
    service = new ResendEmailService('test-api-key', 'noreply@example.com');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with API key and from address', () => {
      expect(service).toBeDefined();
    });
  });

  describe('send', () => {
    it('should send email successfully', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-123' },
        error: null,
      });

      await service.send(testEmailData);

      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@example.com',
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text',
      });
    });

    it('should log success message with email ID', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-456' },
        error: null,
      });

      await service.send(testEmailData);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Email sent successfully to test@example.com, ID: email-456'
      );
    });

    it('should throw error when Resend returns an error', async () => {
      const resendError = { message: 'Invalid API key', name: 'invalid_api_key' };
      mockSend.mockResolvedValue({
        data: null,
        error: resendError,
      });

      await expect(service.send(testEmailData)).rejects.toThrow('Failed to send email: Invalid API key');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Resend email error:', resendError);
    });

    it('should handle and rethrow network errors', async () => {
      const networkError = new Error('Network timeout');
      mockSend.mockRejectedValue(networkError);

      await expect(service.send(testEmailData)).rejects.toThrow('Network timeout');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to send email via Resend:', networkError);
    });

    it('should send email without text field', async () => {
      const dataWithoutText: EmailData = {
        to: 'notext@example.com',
        subject: 'No Text',
        html: '<p>HTML only</p>',
      };

      mockSend.mockResolvedValue({
        data: { id: 'email-789' },
        error: null,
      });

      await service.send(dataWithoutText);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: undefined,
        })
      );
    });

    it('should use custom from address', async () => {
      const customService = new ResendEmailService('key', 'custom@company.com');
      mockSend.mockResolvedValue({
        data: { id: 'email-000' },
        error: null,
      });

      await customService.send(testEmailData);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@company.com',
        })
      );
    });
  });
});
