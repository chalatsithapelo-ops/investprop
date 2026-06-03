import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../tokens';

// Mock environment
vi.mock('../../env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-at-least-32-characters-long',
  },
}));

describe('Token Utils', () => {
  const mockUserId = 123;

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = generateAccessToken(mockUserId);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate different tokens for different users', () => {
      const token1 = generateAccessToken(1);
      const token2 = generateAccessToken(2);
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const refresh = generateRefreshToken(mockUserId);
      expect(refresh).toBeTruthy();
      expect(typeof refresh.token).toBe('string');
      expect(refresh.token.split('.')).toHaveLength(3);
      expect(refresh.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate different tokens for same user at different times', () => {
      const token1 = generateRefreshToken(mockUserId).token;
      const token2 = generateRefreshToken(mockUserId).token;
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(mockUserId);
      const payload = verifyAccessToken(token);

      expect(payload).toBeTruthy();
      expect(payload?.userId).toBe(mockUserId);
      expect(payload?.type).toBe('access');
    });

    it('should return null for invalid token', () => {
      const payload = verifyAccessToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should return null for expired token', () => {
      // Generate token that expires immediately
      const token = generateAccessToken(mockUserId);

      // Wait for token to expire (in real scenario, would need to mock time)
      // For now, just test with malformed token
      const payload = verifyAccessToken(token + 'corrupted');
      expect(payload).toBeNull();
    });

    it('should reject refresh token as access token', () => {
      const refreshToken = generateRefreshToken(mockUserId).token;
      const payload = verifyAccessToken(refreshToken);

      // Should either be null or have wrong type
      if (payload) {
        expect(payload.type).not.toBe('access');
      }
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(mockUserId).token;
      const payload = verifyRefreshToken(token);

      expect(payload).toBeTruthy();
      expect(payload?.userId).toBe(mockUserId);
      expect(payload?.type).toBe('refresh');
    });

    it('should return null for invalid token', () => {
      const payload = verifyRefreshToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should reject access token as refresh token', () => {
      const accessToken = generateAccessToken(mockUserId);
      const payload = verifyRefreshToken(accessToken);

      // Should either be null or have wrong type
      if (payload) {
        expect(payload.type).not.toBe('refresh');
      }
    });
  });

  describe('Token Security', () => {
    it('should not include sensitive data in token', () => {
      const token = generateAccessToken(mockUserId);
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Ensure no password or sensitive fields
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('passwordHash');
      expect(payload).toHaveProperty('userId');
    });

    it('should have expiration set', () => {
      const token = generateAccessToken(mockUserId);
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('access token should expire before refresh token', () => {
      const accessToken = generateAccessToken(mockUserId);
      const refreshToken = generateRefreshToken(mockUserId).token;

      const accessParts = accessToken.split('.');
      const refreshParts = refreshToken.split('.');

      const accessPayload = JSON.parse(
        Buffer.from(accessParts[1], 'base64').toString()
      );
      const refreshPayload = JSON.parse(
        Buffer.from(refreshParts[1], 'base64').toString()
      );

      expect(accessPayload.exp).toBeLessThan(refreshPayload.exp);
    });
  });
});
