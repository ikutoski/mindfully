import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  requireAuth,
  optionalAuth,
  requireEmailVerified,
  requireRole,
} from '../../src/auth/middleware';

describe('Auth Middleware', () => {
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const mockNext = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should return 401 when not authenticated', () => {
      const req = {
        isAuthenticated: undefined,
      } as unknown as Request;

      requireAuth(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when isAuthenticated returns false', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(false),
      } as unknown as Request;

      requireAuth(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when authenticated', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
      } as unknown as Request;

      requireAuth(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should always call next', () => {
      const req = {} as Request;

      optionalAuth(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireEmailVerified', () => {
    it('should return 401 when not authenticated', () => {
      const req = {
        isAuthenticated: undefined,
      } as unknown as Request;

      requireEmailVerified(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when email is not verified', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
        user: { email_verified: false },
      } as unknown as Request;

      requireEmailVerified(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email not verified',
        message: 'Please verify your email address to access this feature',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user has no email_verified field', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
        user: {},
      } as unknown as Request;

      requireEmailVerified(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when email is verified', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
        user: { email_verified: true },
      } as unknown as Request;

      requireEmailVerified(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should return 401 when not authenticated', () => {
      const req = {
        isAuthenticated: undefined,
      } as unknown as Request;

      const middleware = requireRole('admin');
      middleware(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when authenticated (role check not implemented)', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
        user: { role: 'admin' },
      } as unknown as Request;

      const middleware = requireRole('admin');
      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should work with any role string', () => {
      const req = {
        isAuthenticated: vi.fn().mockReturnValue(true),
      } as unknown as Request;

      const middleware = requireRole('superadmin');
      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
