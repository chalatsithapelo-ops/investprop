import { describe, it, expect, beforeEach } from 'vitest';
import { validateRole } from '../auth-helpers';
import type { User } from '@prisma/client';

describe('Auth Helpers', () => {
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword',
      role: 'INVESTOR',
      createdAt: new Date(),
      updatedAt: new Date(),
      phoneNumber: null,
      companyName: null,
      emailVerified: false,
      verificationToken: null,
    };
  });

  describe('validateRole', () => {
    it('should return true for matching role', () => {
      const result = validateRole(mockUser, 'INVESTOR');
      expect(result).toBe(true);
    });

    it('should return false for non-matching role', () => {
      const result = validateRole(mockUser, 'MANAGER');
      expect(result).toBe(false);
    });

    it('should return true for DEV_MANAGER role', () => {
      mockUser.role = 'DEV_MANAGER';
      const result = validateRole(mockUser, 'DEV_MANAGER');
      expect(result).toBe(true);
    });

    it('should return true for CONTRACTOR role', () => {
      mockUser.role = 'CONTRACTOR';
      const result = validateRole(mockUser, 'CONTRACTOR');
      expect(result).toBe(true);
    });

    it('should return true for ADMIN role', () => {
      mockUser.role = 'ADMIN';
      const result = validateRole(mockUser, 'ADMIN');
      expect(result).toBe(true);
    });

    it('should handle multiple role checks', () => {
      expect(validateRole(mockUser, 'INVESTOR')).toBe(true);
      expect(validateRole(mockUser, 'MANAGER')).toBe(false);
      expect(validateRole(mockUser, 'CONTRACTOR')).toBe(false);
    });
  });
});
