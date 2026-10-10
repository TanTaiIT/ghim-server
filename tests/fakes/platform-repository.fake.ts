import type {
  AuditLog,
  ConfigVersion,
  PlatformRepository,
  StaffPermissionRow,
} from '../../src/modules/platform/platform.repository.js';
import { createFakeAuditLog, type FakeAuditLog } from './audit.fake.js';

export interface FakePlatformRepository extends PlatformRepository {
  readonly staff: Map<string, StaffPermissionRow>;
  readonly configVersions: Map<number, ConfigVersion>;
  readonly audit: AuditLog[];
}

/** Cùng hình dạng với bản Prisma; nhật ký là mảng để test assert "có đúng một dòng". */
export function createFakePlatformRepository({
  auditLog = createFakeAuditLog(),
}: { auditLog?: FakeAuditLog } = {}): FakePlatformRepository {
  const staff = new Map<string, StaffPermissionRow>();
  const configVersions = new Map<number, ConfigVersion>();
  const audit = auditLog.rows;
  const writeAudit = auditLog.append;

  const current = (): ConfigVersion | null =>
    [...configVersions.values()].toSorted((a, b) => b.version - a.version)[0] ?? null;

  return {
    staff,
    configVersions,
    audit,

    findStaff: async (accountId) => staff.get(accountId) ?? null,
    listStaff: async ({ categoryId }) =>
      [...staff.values()]
        .filter((row) => categoryId === undefined || row.categoryIds.includes(categoryId))
        .toSorted((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime()),
    async upsertStaff({ accountId, scopes, categoryIds, grantedBy, at, audit: entry }) {
      const existing = staff.get(accountId);
      const row: StaffPermissionRow = existing
        ? { ...existing, scopes, categoryIds: [...categoryIds], updatedAt: at }
        : {
            accountId,
            scopes,
            categoryIds: [...categoryIds],
            status: 'active',
            suspendedReason: null,
            suspendedAt: null,
            grantedBy,
            grantedAt: at,
            updatedAt: at,
          };
      staff.set(accountId, row);
      writeAudit(entry, at);
      return row;
    },
    async revokeStaff({ accountId, at, audit: entry }) {
      if (!staff.delete(accountId)) return false;
      writeAudit(entry, at);
      return true;
    },
    async restoreStaff({ accountId, at, audit: entry }) {
      const existing = staff.get(accountId);
      if (!existing) throw new Error(`Không có quyền staff ${accountId}`);
      const row = {
        ...existing,
        status: 'active' as const,
        suspendedAt: null,
        suspendedReason: null,
        updatedAt: at,
      };
      staff.set(accountId, row);
      writeAudit(entry, at);
      return row;
    },
    async suspendStaff({ accountId, reason, at }) {
      const existing = staff.get(accountId);
      if (!existing || existing.status !== 'active') return false;
      staff.set(accountId, {
        ...existing,
        status: 'suspended',
        suspendedAt: at,
        suspendedReason: reason,
        updatedAt: at,
      });
      return true;
    },

    findCurrentConfig: async () => current(),
    findConfigVersion: async (version) => configVersions.get(version) ?? null,
    async seedConfigVersion(values, createdBy, at) {
      if (configVersions.size > 0) return null;
      const row: ConfigVersion = { version: 1, values, note: null, createdBy, createdAt: at };
      configVersions.set(1, row);
      return row;
    },
    async createConfigVersion({ baseVersion, values, note, createdBy, at, audit: entry }) {
      const head = current();
      if (!head || head.version !== baseVersion) return null;
      const row: ConfigVersion = {
        version: baseVersion + 1,
        values,
        note,
        createdBy,
        createdAt: at,
      };
      configVersions.set(row.version, row);
      if (entry) writeAudit(entry, at);
      return row;
    },

    async queryAudit({ actorId, targetType, targetId, from, to, skip, take }) {
      const all = audit
        .filter((row) => actorId === undefined || row.actorId === actorId)
        .filter((row) => targetType === undefined || row.targetType === targetType)
        .filter((row) => targetId === undefined || row.targetId === targetId)
        .filter((row) => from === undefined || row.createdAt >= from)
        .filter((row) => to === undefined || row.createdAt <= to)
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return { items: all.slice(skip, skip + take), total: all.length };
    },
  };
}
