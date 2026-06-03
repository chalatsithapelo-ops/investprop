import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  RATE_LIMITS,
} from '../rate-limiter';

describe('Rate Limiter', () => {
  const testIdentifier = 'test-user';

  beforeEach(() => {
    // Reset before each test
    resetRateLimit(testIdentifier);
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const config = { windowMs: 60000, maxRequests: 3 };

      const result1 = checkRateLimit(testIdentifier, config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = checkRateLimit(testIdentifier, config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = checkRateLimit(testIdentifier, config);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should block requests exceeding limit', () => {
      const config = { windowMs: 60000, maxRequests: 2 };

      checkRateLimit(testIdentifier, config);
      checkRateLimit(testIdentifier, config);

      const blocked = checkRateLimit(testIdentifier, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after window expires', async () => {
      const config = { windowMs: 100, maxRequests: 2 }; // 100ms window

      checkRateLimit(testIdentifier, config);
      checkRateLimit(testIdentifier, config);

      // Should be blocked immediately
      let blocked = checkRateLimit(testIdentifier, config);
      expect(blocked.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      const allowed = checkRateLimit(testIdentifier, config);
      expect(allowed.allowed).toBe(true);
      expect(allowed.remaining).toBe(1);
    });

    it('should handle different identifiers independently', () => {
      const config = { windowMs: 60000, maxRequests: 1 };

      const result1 = checkRateLimit('user1', config);
      const result2 = checkRateLimit('user2', config);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);

      // Block user1
      const blocked1 = checkRateLimit('user1', config);
      expect(blocked1.allowed).toBe(false);

      // user2 should still be allowed
      const allowed2 = checkRateLimit('user2', config);
      expect(allowed2.allowed).toBe(false); // Also at limit now
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status without incrementing', () => {
      const config = { windowMs: 60000, maxRequests: 3 };

      const status1 = getRateLimitStatus(testIdentifier, config);
      expect(status1.remaining).toBe(3);

      const status2 = getRateLimitStatus(testIdentifier, config);
      expect(status2.remaining).toBe(3); // Should not change

      // Actually make a request
      checkRateLimit(testIdentifier, config);

      const status3 = getRateLimitStatus(testIdentifier, config);
      expect(status3.remaining).toBe(2);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset limit for identifier', () => {
      const config = { windowMs: 60000, maxRequests: 2 };

      checkRateLimit(testIdentifier, config);
      checkRateLimit(testIdentifier, config);

      // Should be at limit
      const blocked = checkRateLimit(testIdentifier, config);
      expect(blocked.allowed).toBe(false);

      // Reset
      resetRateLimit(testIdentifier);

      // Should be allowed again
      const allowed = checkRateLimit(testIdentifier, config);
      expect(allowed.allowed).toBe(true);
      expect(allowed.remaining).toBe(1);
    });
  });

  describe('RATE_LIMITS constants', () => {
    it('should have LOGIN rate limits', () => {
      expect(RATE_LIMITS.LOGIN).toBeDefined();
      expect(RATE_LIMITS.LOGIN.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(RATE_LIMITS.LOGIN.maxRequests).toBe(5);
    });

    it('should have REGISTER rate limits', () => {
      expect(RATE_LIMITS.REGISTER).toBeDefined();
      expect(RATE_LIMITS.REGISTER.windowMs).toBe(60 * 60 * 1000); // 1 hour
      expect(RATE_LIMITS.REGISTER.maxRequests).toBe(3);
    });

    it('should have stricter limits for auth endpoints', () => {
      expect(RATE_LIMITS.LOGIN.maxRequests).toBeLessThan(
        RATE_LIMITS.API_GENERAL.maxRequests
      );
      expect(RATE_LIMITS.REGISTER.maxRequests).toBeLessThan(
        RATE_LIMITS.API_GENERAL.maxRequests
      );
    });
  });

  describe('Realistic scenarios', () => {
    it('should handle brute force login attempts', () => {
      const config = RATE_LIMITS.LOGIN;
      const email = 'victim@example.com';

      // Simulate 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(`login:${email}`, config);
        expect(result.allowed).toBe(true);
      }

      // 6th attempt should be blocked
      const blocked = checkRateLimit(`login:${email}`, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it('should handle API burst traffic', () => {
      const config = RATE_LIMITS.API_GENERAL;
      const userId = 'user-123';

      // Simulate 100 requests in quick succession
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit(`api:${userId}`, config);
        expect(result.allowed).toBe(true);
      }

      // 101st request should be blocked
      const blocked = checkRateLimit(`api:${userId}`, config);
      expect(blocked.allowed).toBe(false);
    });
  });
});
