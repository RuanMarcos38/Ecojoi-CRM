import { describe, it, expect } from 'vitest';
import { hasPermission } from '@/lib/auth/permissions';

describe('RBAC', () => {
  it('blocks feature management for regular users', () => expect(hasPermission('user', 'features.manage')).toBe(false));
  it('allows company admins to manage features', () => expect(hasPermission('company_admin', 'features.manage')).toBe(true));
  it('allows managers to work deals', () => expect(hasPermission('manager', 'deals.update')).toBe(true));
  it('allows operational users to move conversations between attendance queues', () => expect(hasPermission('user', 'conversations.manage')).toBe(true));
  it('keeps audit access blocked for regular users', () => expect(hasPermission('user', 'audit.view')).toBe(false));
});
