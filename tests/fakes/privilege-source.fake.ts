import type {
  OpsScope,
  PermissionState,
  PrivilegeSource,
} from '../../src/common/auth/privilege-source.js';

export interface FakePrivilegeSource extends PrivilegeSource {
  /** Gắn (thay cả gói) quyền staff cho một tài khoản — bản giả của `platform.grantStaff`. */
  grant(accountId: string, scopes?: OpsScope[], categoryIds?: string[]): void;
  suspend(accountId: string): void;
  restore(accountId: string): void;
  revoke(accountId: string): void;
}

/** Quyền staff trong bộ nhớ cho test HTTP không cần module `platform` thật. */
export function createFakePrivilegeSource(): FakePrivilegeSource {
  const scopes = new Map<string, Set<OpsScope>>();
  const categories = new Map<string, Set<string>>();
  const suspended = new Set<string>();

  const state = (accountId: string): PermissionState => {
    if (!scopes.has(accountId)) return 'none';
    return suspended.has(accountId) ? 'suspended' : 'active';
  };

  return {
    grant(accountId, scopeList = [], categoryIds = []) {
      scopes.set(accountId, new Set(scopeList));
      categories.set(accountId, new Set(categoryIds));
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
    permissionState: async (accountId) => state(accountId),
    hasStaffScope: async (accountId, scope) =>
      state(accountId) === 'active' && (scopes.get(accountId)?.has(scope) ?? false),
    hasCategoryScope: async (accountId, categoryId) =>
      state(accountId) === 'active' && (categories.get(accountId)?.has(categoryId) ?? false),
    isStaff: async (accountId) => state(accountId) !== 'none',
  };
}
