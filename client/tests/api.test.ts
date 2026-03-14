import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTokenExpired, ApiError } from '../src/lib/api';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
    removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
    clear: () => {
    store = {};
  },
  setStore: (newStore: Record<string, string>) => {
    store = newStore;
  },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

function createJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = 'fake-signature';
  return `${header}.${payloadB64}.${signature}`;
}

describe('isTokenExpired', () => {
  it('returns true for expired token', () => {
    const expiredToken = createJWT({
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(isTokenExpired(expiredToken)).toBe(true);
  });

  it('returns false for valid token', () => {
    const validToken = createJWT({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(isTokenExpired(validToken)).toBe(false);
  });

  it('returns true for token with missing exp field', () => {
    const tokenWithoutExp = createJWT({ sub: 'user-123' });
    expect(isTokenExpired(tokenWithoutExp)).toBe(true);
  });

  it('returns true for malformed token', () => {
    expect(isTokenExpired('not-a-valid-token')).toBe(true);
    expect(isTokenExpired('')).toBe(true);
    expect(isTokenExpired('only.one.part')).toBe(true);
  });
});

describe('ApiError', () => {
  it('creates error with all properties', () => {
    const error = new ApiError(404, 'Not found', 'NOT_FOUND', { resource: 'user' });
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.data).toEqual({ resource: 'user' });
    expect(error.name).toBe('ApiError');
  });

  it('creates error with minimal properties', () => {
    const error = new ApiError(500, 'Internal server error');
    expect(error.status).toBe(500);
    expect(error.message).toBe('Internal server error');
    expect(error.code).toBeUndefined();
    expect(error.data).toBeUndefined();
  });
});
