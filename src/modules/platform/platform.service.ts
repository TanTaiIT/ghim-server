import type { Actor } from '../../common/auth/actor.js';
import { auditActor } from '../../common/audit/audit.js';
import type { OpsScope, PrivilegeSource } from '../../common/auth/privilege-source.js';
import {
  CONFIG_KEY_LIST,
  configRelationIssues,
  configValueIssue,
  isConfigKey,
  type RuntimeConfigKey,
} from '../../common/config/config-keys.js';
import { RUNTIME_CONFIG_DEFAULTS, type RuntimeConfig } from '../../common/config/runtime-config.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { toPage, type PaginationQuery, toSkipTake } from '../../common/schemas/pagination.js';
import type {
  AuditLog,
  ConfigVersion,
  PlatformRepository,
  StaffPermissionRow,
} from './platform.repository.js';
import { SUSPENDED_REASON_LOCKED, SYSTEM_ACTOR_ID } from './platform.schema.js';

/** `identity` trả lời "tài khoản này đang ra sao" — đủ để quyết có gắn quyền được không. */
export interface AccountStateReader {
  accountState(accountId: string): Promise<{ role: 'user' | 'master'; status: string } | null>;
}

/** `category` trả lời "danh mục nào trong số này có thật". */
export interface CategoryExistence {
  existingIds(ids: string[]): Promise<Set<string>>;
}

export interface PlatformServiceDeps {
  repository: PlatformRepository;
  identity: AccountStateReader;
  categories: CategoryExistence;
  clock: () => Date;
  /** Nạp lại bảng ngay khi chính tiến trình này ghi phiên bản mới — có hiệu lực từ lượt tính kế tiếp. */
  runtimeConfig?: Pick<VersionedRuntimeConfig, 'load'>;
}

export interface StaffGrant {
  scopes: OpsScope[];
  categoryIds: string[];
}

export interface StaffPermissionDto {
  accountId: string;
  scopes: OpsScope[];
  categoryIds: string[];
  status: StaffPermissionRow['status'];
  suspendedReason: string | null;
  grantedAt: string;
}

export interface ConfigVersionDto {
  version: number;
  values: Record<string, number>;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ConfigChange {
  baseVersion: number;
  changes: Record<string, number>;
  note?: string | undefined;
}

export interface AuditEntryDto {
  id: string;
  actorId: string;
  actorRole: 'user' | 'master';
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFilter extends PaginationQuery {
  actorId?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface PlatformService {
  grantStaff(actor: Actor, accountId: string, grant: StaffGrant): Promise<StaffPermissionDto>;
  revokeStaff(actor: Actor, accountId: string): Promise<void>;
  restoreStaff(actor: Actor, accountId: string): Promise<StaffPermissionDto>;
  /** Bên nghe `identity.account.locked`; idempotent. */
  suspendStaffForLock(accountId: string): Promise<void>;
  /** Bên nghe `identity.account.deleted`: thu hẳn, kể cả quyền đang treo; idempotent. */
  revokeStaffForDeletion(accountId: string): Promise<void>;
  listStaff(categoryId?: string): Promise<StaffPermissionDto[]>;
  /** Cổng cho `review`: staff đang hoạt động của từng danh mục — người xử việc của danh mục đó (TK 16). */
  activeStaffByCategory(categoryIds: string[]): Promise<Map<string, string[]>>;
  /** Staff đang hoạt động mang một việc ở bàn vận hành — `review` hỏi người xử báo cáo về một người (add-reports). */
  activeStaffWithScope(scope: OpsScope): Promise<string[]>;

  /**
   * Chạy lúc khởi động: bảng rỗng → phiên bản 1 từ sổ đăng ký; phiên bản hiện hành thiếu khoá nào
   * của sổ đăng ký → phiên bản kế thêm đúng các khoá đó với giá trị khởi đầu. Mọi phiên bản vì thế
   * luôn mang TRỌN bộ con số, nên đổi giá trị khởi đầu trong code không âm thầm đổi nghĩa một phiên
   * bản cũ (spec config-versions, rà soát 10/10/2026). `null` khi không phải làm gì.
   */
  ensureConfigVersion(): Promise<{ version: number; addedKeys: number } | null>;
  getCurrentConfig(): Promise<ConfigVersionDto>;
  getConfigVersion(version: number): Promise<ConfigVersionDto>;
  changeConfig(actor: Actor, change: ConfigChange): Promise<ConfigVersionDto>;

  queryAudit(filter: AuditFilter): Promise<ReturnType<typeof toPage<AuditEntryDto>>>;
}

/** Bản thật của `RuntimeConfig`: phiên bản hiện hành trong bộ nhớ, làm mới sau TTL hoặc khi ghi. */
export interface VersionedRuntimeConfig extends RuntimeConfig {
  load(): Promise<void>;
}

const CACHE_TTL_MS = 5_000;

function toStaffDto(row: StaffPermissionRow): StaffPermissionDto {
  return {
    accountId: row.accountId,
    scopes: [...row.scopes],
    categoryIds: [...row.categoryIds],
    status: row.status,
    suspendedReason: row.suspendedReason,
    grantedAt: row.grantedAt.toISOString(),
  };
}

function toConfigDto(row: ConfigVersion): ConfigVersionDto {
  return {
    version: row.version,
    values: row.values as Record<string, number>,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditDto(row: AuditLog): AuditEntryDto {
  return {
    id: row.id,
    actorId: row.actorId,
    actorRole: row.actorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    details: (row.details as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const ineligible = (reason: string): ConflictError =>
  new ConflictError(`Không gắn quyền staff được: ${reason}`, 'STAFF_PERMISSION_INELIGIBLE');

export function createPlatformService(deps: PlatformServiceDeps): PlatformService {
  const { repository, identity, categories, clock } = deps;

  /** Luật chung cho gắn và trả lại: tài khoản thật, là người dùng, đang hoạt động (đã xác nhận email, không khoá). */
  const assertEligible = async (accountId: string): Promise<void> => {
    const state = await identity.accountState(accountId);
    if (!state || state.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
    if (state.role === 'master') throw ineligible('master đã toàn quyền');
    if (state.status === 'locked') throw ineligible('tài khoản đang bị khoá');
    if (state.status !== 'active') throw ineligible('tài khoản chưa xác nhận email');
  };

  return {
    async grantStaff(actor, accountId, { scopes, categoryIds }) {
      await assertEligible(accountId);
      const unique = [...new Set(categoryIds)];
      if (unique.length > 0) {
        const existing = await categories.existingIds(unique);
        const missing = unique.filter((id) => !existing.has(id));
        if (missing.length > 0) throw new NotFoundError('Có danh mục không tồn tại');
      }
      const row = await repository.upsertStaff({
        accountId,
        scopes: [...new Set(scopes)],
        categoryIds: unique,
        grantedBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'platform.staff.grant',
          targetType: 'account',
          targetId: accountId,
          details: { scopes: scopes.join(','), categories: unique.join(',') },
        },
      });
      return toStaffDto(row);
    },

    async revokeStaff(actor, accountId) {
      const revoked = await repository.revokeStaff({
        accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'platform.staff.revoke',
          targetType: 'account',
          targetId: accountId,
        },
      });
      if (!revoked) throw new NotFoundError('Tài khoản này không mang quyền staff');
    },

    async restoreStaff(actor, accountId) {
      const row = await repository.findStaff(accountId);
      if (!row) throw new NotFoundError('Tài khoản này không mang quyền staff');
      if (row.status !== 'suspended') throw new ConflictError('Quyền này không treo');
      await assertEligible(accountId);
      return toStaffDto(
        await repository.restoreStaff({
          accountId,
          at: clock(),
          audit: {
            ...auditActor(actor),
            action: 'platform.staff.restore',
            targetType: 'account',
            targetId: accountId,
          },
        }),
      );
    },

    async suspendStaffForLock(accountId) {
      // Lượt khoá được xử lại sau khi mở khoá và master đã trả quyền: không treo lại (fix-audit-listeners, C1).
      if ((await identity.accountState(accountId))?.status !== 'locked') return;
      await repository.suspendStaff({ accountId, reason: SUSPENDED_REASON_LOCKED, at: clock() });
    },

    async revokeStaffForDeletion(accountId) {
      await repository.removeStaff(accountId);
    },

    activeStaffByCategory: (categoryIds) => repository.activeStaffByCategory(categoryIds),
    activeStaffWithScope: (scope) => repository.activeStaffWithScope(scope),

    async listStaff(categoryId) {
      const rows = await repository.listStaff(categoryId === undefined ? {} : { categoryId });
      return rows.map(toStaffDto);
    },

    async ensureConfigVersion() {
      const at = clock();
      const seeded = await repository.seedConfigVersion(
        { ...RUNTIME_CONFIG_DEFAULTS },
        SYSTEM_ACTOR_ID,
        at,
      );
      if (seeded) {
        await deps.runtimeConfig?.load();
        return { version: seeded.version, addedKeys: CONFIG_KEY_LIST.length };
      }
      const current = await repository.findCurrentConfig();
      if (!current) return null;
      const stored = current.values as Record<string, number>;
      const missing = CONFIG_KEY_LIST.filter((key) => !(key in stored));
      if (missing.length === 0) return null;
      const row = await repository.createConfigVersion({
        baseVersion: current.version,
        values: { ...RUNTIME_CONFIG_DEFAULTS, ...stored },
        note: `Hệ thống thêm ${missing.length} con số mới của sổ đăng ký: ${missing.join(', ')}`,
        createdBy: SYSTEM_ACTOR_ID,
        at,
        audit: null,
      });
      if (!row) return null;
      await deps.runtimeConfig?.load();
      return { version: row.version, addedKeys: missing.length };
    },

    async getCurrentConfig() {
      const row = await repository.findCurrentConfig();
      if (!row) throw new NotFoundError('Bảng con số chưa được nạp');
      return toConfigDto(row);
    },

    async getConfigVersion(version) {
      const row = await repository.findConfigVersion(version);
      if (!row) throw new NotFoundError(`Không có phiên bản ${version}`);
      return toConfigDto(row);
    },

    async changeConfig(actor, { baseVersion, changes, note }) {
      // Một con số sai thì không phiên bản nào được tạo: kiểm hết trước, rồi mới ghi.
      const problems = Object.entries(changes).map(([key, value]) => {
        if (!isConfigKey(key)) return `${key}: không có trong bảng`;
        const issue = configValueIssue(key, value);
        return issue ? `${key}: ${issue}` : null;
      });
      const invalid = problems.filter((item): item is string => item !== null);
      if (invalid.length > 0) {
        throw new BadRequestError(
          `Con số không hợp lệ — ${invalid.join('; ')}`,
          'VALIDATION_ERROR',
        );
      }

      const current = await repository.findCurrentConfig();
      if (!current) throw new NotFoundError('Bảng con số chưa được nạp');
      if (current.version !== baseVersion) {
        throw new ConflictError(`Bảng đã sang phiên bản ${current.version} — tải lại rồi sửa tiếp`);
      }
      // Trọn sổ đăng ký, không chỉ các khoá đang lưu: phiên bản mới luôn đủ bộ con số.
      const values = {
        ...RUNTIME_CONFIG_DEFAULTS,
        ...(current.values as Record<string, number>),
        ...changes,
      };
      // Kiểm trên cả bộ: đổi một khoá có thể làm lệch khoá khác không nằm trong thay đổi.
      const broken = configRelationIssues(values);
      if (broken.length > 0) {
        throw new BadRequestError(`Con số không hợp lệ — ${broken.join('; ')}`, 'VALIDATION_ERROR');
      }
      const row = await repository.createConfigVersion({
        baseVersion,
        values,
        note: note ?? null,
        createdBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'platform.config.change',
          targetType: 'config_version',
          targetId: String(baseVersion + 1),
          reason: note ?? null,
          details: { keys: Object.keys(changes).join(','), version: baseVersion + 1 },
        },
      });
      if (!row) throw new ConflictError('Bảng vừa đổi phiên bản — tải lại rồi sửa tiếp');
      await deps.runtimeConfig?.load();
      return toConfigDto(row);
    },

    async queryAudit({ actorId, targetType, targetId, from, to, ...page }) {
      const { items, total } = await repository.queryAudit({
        ...toSkipTake(page),
        ...(actorId === undefined ? {} : { actorId }),
        ...(targetType === undefined ? {} : { targetType }),
        ...(targetId === undefined ? {} : { targetId }),
        ...(from === undefined ? {} : { from: new Date(from) }),
        ...(to === undefined ? {} : { to: new Date(to) }),
      });
      return toPage(items.map(toAuditDto), total, page);
    },
  };
}

/**
 * `PrivilegeSource` thật: mỗi câu hỏi là một lượt tìm theo khoá chính — thu quyền có hiệu lực
 * ngay (spec staff-permissions), không cache.
 */
export function createPlatformPrivilegeSource(repository: PlatformRepository): PrivilegeSource {
  return {
    staffGrant: (accountId) => repository.findStaffGrant(accountId),
  };
}

/**
 * Đọc phiên bản hiện hành vào bộ nhớ; `get` là đồng bộ nên phải `load()` trước. Sau TTL, lượt
 * `get` kế tiếp châm một lượt làm mới nền và vẫn trả giá trị đang có — không request nào chờ DB
 * vì một con số. Thiếu dòng trong DB thì dùng sổ đăng ký, để app lên được trước khi master nạp.
 */
export function createVersionedRuntimeConfig(
  repository: PlatformRepository,
  now: () => number = Date.now,
): VersionedRuntimeConfig {
  let values: Record<string, number> | null = null;
  let loadedVersion = 0;
  let loadedAt = 0;
  let refreshing: Promise<void> | null = null;

  const load = async (): Promise<void> => {
    const current = await repository.findCurrentConfig();
    values = {
      ...RUNTIME_CONFIG_DEFAULTS,
      ...(current?.values as Record<string, number> | undefined),
    };
    loadedVersion = current?.version ?? 0;
    loadedAt = now();
  };

  const refreshInBackground = (): void => {
    if (refreshing) return;
    refreshing = load().finally(() => {
      refreshing = null;
    });
    void refreshing.catch(() => {});
  };

  return {
    load,
    get(key: RuntimeConfigKey) {
      if (!values) throw new Error('RuntimeConfig chưa load() — server.ts phải nạp trước khi dùng');
      if (now() - loadedAt > CACHE_TTL_MS) refreshInBackground();
      const value = values[key];
      if (value === undefined) throw new Error(`Khoá cấu hình không tồn tại: ${key}`);
      return value;
    },
    version() {
      if (!values) throw new Error('RuntimeConfig chưa load() — server.ts phải nạp trước khi dùng');
      return loadedVersion;
    },
  };
}
