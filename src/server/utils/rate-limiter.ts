/**
 * Simple in-memory rate limiter
 * For production, use Redis or a proper rate limiting service
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check if a request is within rate limits
 * @param identifier - Unique identifier (e.g., IP address, user ID, email)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No previous requests or window expired
  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Within window
  if (entry.count < config.maxRequests) {
    entry.count++;
    rateLimitStore.set(identifier, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000), // Seconds until reset
  };
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Authentication endpoints - strict limits
  LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
  },
  REGISTER: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 registrations per hour per IP
  },
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 password reset requests per hour
  },

  // API endpoints - moderate limits
  API_GENERAL: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
  API_WRITE: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 20, // 20 write operations per minute
  },

  // Email endpoints - very strict
  EMAIL_SEND: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 emails per hour
  },

  // File uploads — strict
  FILE_UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20, // 20 uploads / hour / user
  },
  // KYC submissions — very strict (per user)
  KYC_SUBMIT: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 5,
  },
  // Payment confirmation — limit replay attempts
  PAYMENT_CONFIRM: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
  },
  // Investment creation — prevent spam
  INVESTMENT_CREATE: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
  },
} as const;

/**
 * Reset rate limit for a specific identifier
 * Useful for testing or after successful authentication
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
    };
  }

  return {
    allowed: entry.count < config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
    retryAfter: entry.count >= config.maxRequests
      ? Math.ceil((entry.resetAt - now) / 1000)
      : undefined,
  };
}
