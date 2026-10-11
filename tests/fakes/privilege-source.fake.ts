import type { OpsScope, PrivilegeSource } from '../../src/common/auth/privilege-source.js';

export interface FakePrivilegeSource extends PrivilegeSource {
  /** Gắn (thay cả gói) quyền staff cho một tài khoản — bản giả của `platform.grantStaff`. */
  grant(accountId: string, scopes?: OpsScope[], categoryIds?: string[]): void;
  suspend(accountId: string): void;
  restore(accountId: string): void;
  revoke(accountId: string): void;
}

/** Quyền staff trong bộ nhớ cho test HTTP không cần module `platform` thật. */
export function createFakePrivilegeSource(): FakePrivilegeSource {
  const scopes = new Map<string, OpsScope[]>();
  const categories = new Map<string, string[]>();
  const suspended = new Set<string>();

  return {
    grant(accountId, scopeList = [], categoryIds = []) {
      scopes.set(accountId, [...scopeList]);
      categories.set(accountId, [...categoryIds]);
    },
    suspend(accountId) {
      suspended.add(accountId);
    },
    restore(accountId) {
      suspended.delete(accountId);
    },
    revoke(accountId) {
      scopes.delete(accountId);
      categories.delete(accountId);
      suspended.delete(accountId);
    },
    async staffGrant(accountId) {
      const granted = scopes.get(accountId);
      if (!granted) return null;
      return {
        status: suspended.has(accountId) ? 'suspended' : 'active',
        scopes: granted,
        categoryIds: categories.get(accountId) ?? [],
      };
    },
  };
}
