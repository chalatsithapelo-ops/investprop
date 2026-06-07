import { describe, it, expect } from 'vitest';
import { requireRole } from '../auth-helpers';
import type { UserRole } from '@prisma/client';

const asUser = (role: UserRole) => ({ role });

describe('requireRole', () => {
  it('allows a user whose role is in the allowed list', () => {
    expect(() => requireRole(asUser('INVESTOR'), ['INVESTOR'])).not.toThrow();
  });

  it('throws FORBIDDEN when the role is not allowed', () => {
    expect(() => requireRole(asUser('INVESTOR'), ['DEVELOPMENT_MANAGER'])).toThrow();
  });

  it('lets ADMIN bypass every role check (super-role)', () => {
    expect(() => requireRole(asUser('ADMIN'), ['DEVELOPMENT_MANAGER'])).not.toThrow();
  });

  it('allows when the role is one of several permitted roles', () => {
    expect(() =>
      requireRole(asUser('PROJECT_MANAGER'), ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER']),
    ).not.toThrow();
  });

  it('uses a custom error message when provided', () => {
    expect(() => requireRole(asUser('INVESTOR'), ['ADMIN'], 'Admins only')).toThrow('Admins only');
  });
});
