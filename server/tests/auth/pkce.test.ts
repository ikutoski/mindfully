import { describe, it, expect } from 'vitest';
import { pkceUtils } from '../../src/auth/utils/pkce.js';
import { createHash } from 'crypto';

describe('pkceUtils', () => {
  describe('generateVerifier', () => {
    it('should generate a verifier with default length of 128', () => {
      const verifier = pkceUtils.generateVerifier();

      expect(verifier).toBeDefined();
      expect(typeof verifier).toBe('string');
      expect(verifier.length).toBe(128);
    });

    it('should generate a verifier with custom length', () => {
      const verifier = pkceUtils.generateVerifier(64);

      expect(verifier.length).toBe(64);
    });

    it('should generate unique verifiers', () => {
      const verifier1 = pkceUtils.generateVerifier();
      const verifier2 = pkceUtils.generateVerifier();

      expect(verifier1).not.toBe(verifier2);
    });

    it('should only contain hex characters', () => {
      const verifier = pkceUtils.generateVerifier();
      const hexRegex = /^[0-9a-f]+$/;

      expect(hexRegex.test(verifier)).toBe(true);
    });

    it('should throw error for verifier shorter than 43 characters', () => {
      expect(() => pkceUtils.generateVerifier(42)).toThrow(
        'Code verifier must be between 43 and 128 characters'
      );
    });

    it('should generate verifier with minimum valid length of 43', () => {
      const verifier = pkceUtils.generateVerifier(43);

      expect(verifier.length).toBe(43);
    });
  });

  describe('generateChallenge', () => {
    it('should generate a challenge from a verifier', () => {
      const verifier = pkceUtils.generateVerifier();
      const challenge = pkceUtils.generateChallenge(verifier);

      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('should generate base64url encoded SHA256 hash', () => {
      const verifier = 'test-verifier-string';
      const challenge = pkceUtils.generateChallenge(verifier);
      const expectedHash = createHash('sha256')
        .update(verifier)
        .digest()
        .toString('base64url');

      expect(challenge).toBe(expectedHash);
    });

    it('should generate same challenge for same verifier', () => {
      const verifier = pkceUtils.generateVerifier();
      const challenge1 = pkceUtils.generateChallenge(verifier);
      const challenge2 = pkceUtils.generateChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = pkceUtils.generateVerifier();
      const verifier2 = pkceUtils.generateVerifier();
      const challenge1 = pkceUtils.generateChallenge(verifier1);
      const challenge2 = pkceUtils.generateChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('generate', () => {
    it('should generate PKCE challenge object', () => {
      const pkce = pkceUtils.generate();

      expect(pkce).toBeDefined();
      expect(pkce.code_verifier).toBeDefined();
      expect(pkce.code_challenge).toBeDefined();
    });

    it('should generate valid verifier and challenge pair', () => {
      const pkce = pkceUtils.generate();
      const expectedChallenge = pkceUtils.generateChallenge(pkce.code_verifier);

      expect(pkce.code_challenge).toBe(expectedChallenge);
    });

    it('should generate unique PKCE challenges', () => {
      const pkce1 = pkceUtils.generate();
      const pkce2 = pkceUtils.generate();

      expect(pkce1.code_verifier).not.toBe(pkce2.code_verifier);
      expect(pkce1.code_challenge).not.toBe(pkce2.code_challenge);
    });
  });

  describe('verify', () => {
    it('should return true for valid verifier and challenge pair', () => {
      const pkce = pkceUtils.generate();
      const isValid = pkceUtils.verify(pkce.code_verifier, pkce.code_challenge);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid verifier', () => {
      const pkce = pkceUtils.generate();
      const wrongVerifier = pkceUtils.generateVerifier();
      const isValid = pkceUtils.verify(wrongVerifier, pkce.code_challenge);

      expect(isValid).toBe(false);
    });

    it('should return false for invalid challenge', () => {
      const pkce = pkceUtils.generate();
      const wrongChallenge = pkceUtils.generateChallenge('wrong-verifier');
      const isValid = pkceUtils.verify(pkce.code_verifier, wrongChallenge);

      expect(isValid).toBe(false);
    });

    it('should return false for empty verifier', () => {
      const pkce = pkceUtils.generate();
      const isValid = pkceUtils.verify('', pkce.code_challenge);

      expect(isValid).toBe(false);
    });

    it('should return false for empty challenge', () => {
      const pkce = pkceUtils.generate();
      const isValid = pkceUtils.verify(pkce.code_verifier, '');

      expect(isValid).toBe(false);
    });
  });
});
