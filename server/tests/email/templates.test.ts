import { describe, it, expect } from 'vitest';
import {
  getVerificationEmailHtml,
  getVerificationEmailText,
  getPasswordResetEmailHtml,
  getPasswordResetEmailText,
} from '../../src/email/templates.js';

describe('email/templates', () => {
  describe('getVerificationEmailHtml', () => {
    it('should generate HTML email with verification link', () => {
      const token = 'test-verification-token-123';
      const html = getVerificationEmailHtml(token);

      expect(html).toBeDefined();
      expect(html).toContain('MINDFUL');
      expect(html).toContain('Verify Your Email Address');
      expect(html).toContain(token);
      expect(html).toContain('Verify Email');
      expect(html).toContain('This link will expire in 24 hours');
    });

    it('should include user name when provided', () => {
      const token = 'test-token';
      const html = getVerificationEmailHtml(token, 'John Doe');

      expect(html).toContain('Hello John Doe');
    });

    it('should not include greeting when name is not provided', () => {
      const token = 'test-token';
      const html = getVerificationEmailHtml(token);

      expect(html).not.toContain('Hello');
    });

    it('should include cyberpunk styling', () => {
      const token = 'test-token';
      const html = getVerificationEmailHtml(token);

      expect(html).toContain('background-color: #0a0a12');
      expect(html).toContain('#00e5ff');
      expect(html).toContain('font-family');
    });

    it('should include token in verification link', () => {
      const token = 'test-token-abc';
      const html = getVerificationEmailHtml(token);

      expect(html).toContain(`token=${token}`);
      expect(html).toContain('/auth/verify-email');
    });

    it('should include current year in footer', () => {
      const token = 'test-token';
      const html = getVerificationEmailHtml(token);
      const currentYear = new Date().getFullYear().toString();

      expect(html).toContain(`© ${currentYear}`);
    });
  });

  describe('getVerificationEmailText', () => {
    it('should generate plain text email with verification link', () => {
      const token = 'test-verification-token-123';
      const text = getVerificationEmailText(token);

      expect(text).toBeDefined();
      expect(text).toContain('MINDFUL');
      expect(text).toContain('Verify Your Email Address');
      expect(text).toContain(token);
      expect(text).toContain('This link will expire in 24 hours');
    });

    it('should include user name when provided', () => {
      const token = 'test-token';
      const text = getVerificationEmailText(token, 'John Doe');

      expect(text).toContain('Hello John Doe');
    });

    it('should not include HTML tags', () => {
      const token = 'test-token';
      const text = getVerificationEmailText(token);

      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
    });

    it('should include token in verification link', () => {
      const token = 'test-token-abc';
      const text = getVerificationEmailText(token);

      expect(text).toContain(`token=${token}`);
      expect(text).toContain('/auth/verify-email');
    });
  });

  describe('getPasswordResetEmailHtml', () => {
    it('should generate HTML email with reset link', () => {
      const token = 'test-reset-token-456';
      const html = getPasswordResetEmailHtml(token);

      expect(html).toBeDefined();
      expect(html).toContain('MINDFUL');
      expect(html).toContain('Reset Your Password');
      expect(html).toContain(token);
      expect(html).toContain('Reset Password');
      expect(html).toContain('This link will expire in 1 hour');
    });

    it('should include user name when provided', () => {
      const token = 'test-token';
      const html = getPasswordResetEmailHtml(token, 'Jane Doe');

      expect(html).toContain('Hello Jane Doe');
    });

    it('should not include greeting when name is not provided', () => {
      const token = 'test-token';
      const html = getPasswordResetEmailHtml(token);

      expect(html).not.toContain('Hello');
    });

    it('should include cyberpunk styling', () => {
      const token = 'test-token';
      const html = getPasswordResetEmailHtml(token);

      expect(html).toContain('background-color: #0a0a12');
      expect(html).toContain('#00e5ff');
      expect(html).toContain('font-family');
    });

    it('should include token in reset link', () => {
      const token = 'test-reset-xyz';
      const html = getPasswordResetEmailHtml(token);

      expect(html).toContain(`token=${token}`);
      expect(html).toContain('/reset-password');
    });

    it('should include current year in footer', () => {
      const token = 'test-token';
      const html = getPasswordResetEmailHtml(token);
      const currentYear = new Date().getFullYear().toString();

      expect(html).toContain(`© ${currentYear}`);
    });
  });

  describe('getPasswordResetEmailText', () => {
    it('should generate plain text email with reset link', () => {
      const token = 'test-reset-token-456';
      const text = getPasswordResetEmailText(token);

      expect(text).toBeDefined();
      expect(text).toContain('MINDFUL');
      expect(text).toContain('Reset Your Password');
      expect(text).toContain(token);
      expect(text).toContain('This link will expire in 1 hour');
    });

    it('should include user name when provided', () => {
      const token = 'test-token';
      const text = getPasswordResetEmailText(token, 'Jane Doe');

      expect(text).toContain('Hello Jane Doe');
    });

    it('should not include HTML tags', () => {
      const token = 'test-token';
      const text = getPasswordResetEmailText(token);

      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
    });

    it('should include token in reset link', () => {
      const token = 'test-reset-xyz';
      const text = getPasswordResetEmailText(token);

      expect(text).toContain(`token=${token}`);
      expect(text).toContain('/reset-password');
    });
  });
});
