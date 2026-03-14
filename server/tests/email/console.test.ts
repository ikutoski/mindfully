import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleEmailService, type EmailData } from '../../src/email/console';

describe('ConsoleEmailService', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let service: ConsoleEmailService;

  beforeEach(() => {
    service = new ConsoleEmailService();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('send', () => {
    it('should log email data to console', async () => {
      const data: EmailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test plain text',
      };

      await service.send(data);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('test@example.com');
      expect(output).toContain('Test Subject');
      expect(output).toContain('Test HTML');
      expect(output).toContain('Test plain text');
    });

    it('should handle email without text field', async () => {
      const data: EmailData = {
        to: 'user@example.com',
        subject: 'No Text',
        html: '<p>HTML only</p>',
      };

      await service.send(data);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('(no plain text)');
    });

    it('should format email with separators', async () => {
      const data: EmailData = {
        to: 'formatted@example.com',
        subject: 'Formatted Email',
        html: '<div>Content</div>',
        text: 'Plain content',
      };

      await service.send(data);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('========================================');
      expect(output).toContain('📧 EMAIL (Development Mode)');
      expect(output).toContain('----------------------------------------');
    });

    it('should include To and Subject labels', async () => {
      const data: EmailData = {
        to: 'labeled@example.com',
        subject: 'Labeled Subject',
        html: '<span>Body</span>',
      };

      await service.send(data);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('To:');
      expect(output).toContain('Subject:');
      expect(output).toContain('Text:');
      expect(output).toContain('HTML:');
    });
  });
});
