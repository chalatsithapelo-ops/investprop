import { beforeAll } from 'vitest';

// Provide the minimum required environment variables so that importing server
// modules (which eagerly parse process.env via src/server/env.ts) does not throw
// during unit tests. Only set values that are not already provided so a real
// local/CI environment is never clobbered.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-test-jwt-secret-test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-32x';
process.env.NODE_ENV ??= 'test';

beforeAll(() => {
  // Reserved for global test setup.
});
