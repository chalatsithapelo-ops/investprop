import { beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-at-least-32-characters-long';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/property_investment_test';
  process.env.ADMIN_PASSWORD = 'testpassword';
});

// Clean up after tests
afterAll(() => {
  // Clean up any resources if needed
});

afterEach(() => {
  // Clear any mocks or temporary data
});
