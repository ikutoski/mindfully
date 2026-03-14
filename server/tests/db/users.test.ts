import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usersRepository, User } from '../../src/db/repositories/users.js';

// Mock the db module
vi.mock('../../src/db/index.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

import { db } from '../../src/db/index.js';

const mockDb = vi.mocked(db);

describe('usersRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.findById('user-123');

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        ['user-123']
      );
    });

    it('should return null when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await usersRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.findByEmail('TEST@EXAMPLE.COM');

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1',
        ['test@example.com'] // Should be lowercased
      );
    });

    it('should return null when user not found by email', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await usersRepository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a user with all fields', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.create({
        email: 'TEST@EXAMPLE.COM',
        passwordHash: 'hashed-password',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        emailVerified: true,
      });

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['test@example.com', 'hashed-password', 'Test User', 'https://example.com/avatar.png', true]
      );
    });

    it('should create a user with minimal fields', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: null,
        name: null,
        avatar_url: null,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.create({
        email: 'test@example.com',
      });

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['test@example.com', null, null, null, false]
      );
    });
  });

  describe('update', () => {
    it('should update user name', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: null,
        name: 'Updated Name',
        avatar_url: null,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.update('user-123', { name: 'Updated Name' });

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(['Updated Name', 'user-123'])
      );
    });

    it('should update email_verified status', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: null,
        name: null,
        avatar_url: null,
        email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.update('user-123', { emailVerified: true });

      expect(result?.email_verified).toBe(true);
    });

    it('should update multiple fields', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'new-hash',
        name: 'New Name',
        avatar_url: 'https://example.com/new-avatar.png',
        email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.update('user-123', {
        name: 'New Name',
        avatarUrl: 'https://example.com/new-avatar.png',
        emailVerified: true,
        passwordHash: 'new-hash',
      });

      expect(result).toEqual(mockUser);
    });

    it('should return current user when no fields to update', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: null,
        name: 'Test User',
        avatar_url: null,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await usersRepository.update('user-123', {});

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        ['user-123']
      );
    });

    it('should return null when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await usersRepository.update('nonexistent', { name: 'New Name' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when user deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await usersRepository.delete('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM users WHERE id = $1',
        ['user-123']
      );
    });

    it('should return false when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await usersRepository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });
});
