import { Prisma } from '@prisma/client';
import type {
  AuditLog,
  ConfigVersion,
  PrismaClient,
  StaffPermission,
  StaffScope,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';

export type { AuditLog, ConfigVersion, StaffScope };

export interface StaffGrantRow {
  status: StaffPermission['status'];
  scopes: StaffScope[];
  categoryIds: string[];
}

/** Quyền staff kèm danh mục được giao — dòng `staff_permissions` ghép với `staff_category_grants`. */
export type StaffPermissionRow = StaffPermission & { categoryIds: string[] };

export interface StaffGrantInput {
  accountId: string;
  scopes: StaffScope[];
  categoryIds: string[];
  grantedBy: string;
  at: Date;
  audit: AuditEntry;
}

export interface StaffActionInput {
  accountId: string;
  at: Date;
  audit: AuditEntry;
}

export interface StaffSuspendInput {
  accountId: string;
  reason: string;
  at: Date;
}

export interface ConfigChangeInput {
  /** Phiên bản master đang sửa từ đó; không còn hiện hành thì không ghi (spec config-versions). */
  baseVersion: number;
  values: Record<string, number>;
  note: string | null;
  createdBy: string;
  at: Date;
  /** `null` khi hệ thống tự thêm khoá mới của sổ đăng ký lúc khởi động — không có người làm. */
  audit: AuditEntry | null;
}

export interface AuditQuery {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * Toàn bộ truy vấn của `platform`, kể cả transaction. Thay đổi của master / staff ghi nhật ký
 * TRONG cùng transaction (`audit` là tham số bắt buộc của mọi thao tác ghi do người làm); treo
 * vì khoá là của hệ thống nên không có `audit`.
 */
export interface PlatformRepository {
  findStaff(accountId: string): Promise<StaffPermissionRow | null>;
  /**
   * Gói quyền cho guard bàn vận hành, MỘT câu SQL: `findStaff` dùng `include`, mà Prisma 7 chạy
   * `include` thành hai câu (đo 11/10/2026), trong khi guard chạy ở mọi request bàn vận hành.
   */
  findStaffGrant(accountId: string): Promise<StaffGrantRow | null>;
  listStaff(filter: { categoryId?: string }): Promise<StaffPermissionRow[]>;
  /** Thay cả gói phạm vi; giữ nguyên trạng thái treo nếu đang treo. */
  upsertStaff(input: StaffGrantInput): Promise<StaffPermissionRow>;
  /** `false` khi không có quyền để thu. */
  revokeStaff(input: StaffActionInput): Promise<boolean>;
  restoreStaff(input: StaffActionInput): Promise<StaffPermissionRow>;
  /** Idempotent: đã treo thì không đổi gì và trả `false`. */
  suspendStaff(input: StaffSuspendInput): Promise<boolean>;
  /**
   * Thu hẳn do hệ thống (tài khoản bị xoá): không có người làm nên không có `audit`, như lượt treo.
   * Grant theo danh mục đi theo cascade. Idempotent: không có quyền thì trả `false`.
   */
  removeStaff(accountId: string): Promise<boolean>;

  findCurrentConfig(): Promise<ConfigVersion | null>;
  findConfigVersion(version: number): Promise<ConfigVersion | null>;
  /** Phiên bản 1 khi bảng rỗng; đã có (kể cả do tiến trình khác vừa tạo) thì trả `null`. */
  seedConfigVersion(
    values: Record<string, number>,
    createdBy: string,
    at: Date,
  ): Promise<ConfigVersion | null>;
  /** `null` khi `baseVersion` không còn là hiện hành, kể cả khi thua một lượt ghi chen ngang. */
  createConfigVersion(input: ConfigChangeInput): Promise<ConfigVersion | null>;

  queryAudit(query: AuditQuery): Promise<Page<AuditLog>>;
}

const withCategories = {
  include: { categories: { select: { categoryId: true } } },
} as const;

type RawRow = Prisma.StaffPermissionGetPayload<typeof withCategories>;

/**
 * Hai lượt cùng ghi phiên bản kế (hai master-session, hay hai tiến trình cùng khởi động): PK chặn
 * lượt sau. Với người gọi đó đúng là "phiên bản đã đổi", không phải lỗi hệ thống — trả `null` như
 * khi `baseVersion` lệch, để lúc khởi động không sập vì một tiến trình khác vừa làm cùng việc.
 */
function lostVersionRace(error: unknown): null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
  throw error;
}

function toRow({ categories, ...row }: RawRow): StaffPermissionRow {
  return { ...row, categoryIds: categories.map((grant) => grant.categoryId) };
}

export function createPlatformRepository(prisma: PrismaClient): PlatformRepository {
  return {
    async findStaff(accountId) {
      const row = await prisma.staffPermission.findUnique({
        where: { accountId },
        ...withCategories,
      });
      return row ? toRow(row) : null;
    },

    async findStaffGrant(accountId) {
      const rows = await prisma.$queryRaw<StaffGrantRow[]>`
        SELECT p.status::text AS status, p.scopes::text[] AS scopes,
               COALESCE(
                 array_agg(g.category_id::text ORDER BY g.category_id)
                   FILTER (WHERE g.category_id IS NOT NULL),
                 '{}'
               ) AS "categoryIds"
          FROM staff_permissions p
          LEFT JOIN staff_category_grants g ON g.account_id = p.account_id
         WHERE p.account_id = ${accountId}::uuid
         GROUP BY p.account_id`;
      return rows[0] ?? null;
    },

    async listStaff({ categoryId }) {
      const rows = await prisma.staffPermission.findMany({
        where: categoryId === undefined ? {} : { categories: { some: { categoryId } } },
        orderBy: { grantedAt: 'asc' },
        ...withCategories,
      });
      return rows.map(toRow);
    },

    upsertStaff: ({ accountId, scopes, categoryIds, grantedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        await tx.staffPermission.upsert({
          where: { accountId },
          create: { accountId, scopes, grantedBy, grantedAt: at },
          update: { scopes },
        });
        await tx.staffCategoryGrant.deleteMany({ where: { accountId } });
        if (categoryIds.length > 0) {
          await tx.staffCategoryGrant.createMany({
            data: categoryIds.map((categoryId) => ({ accountId, categoryId })),
          });
        }
        await appendAudit(tx, audit);
        const row = await tx.staffPermission.findUniqueOrThrow({
          where: { accountId },
          ...withCategories,
        });
        return toRow(row);
      }),

    revokeStaff: ({ accountId, audit }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.staffPermission.deleteMany({ where: { accountId } });
        if (count === 0) return false;
        await appendAudit(tx, audit);
        return true;
      }),

    restoreStaff: ({ accountId, audit }) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.staffPermission.update({
          where: { accountId },
          data: { status: 'active', suspendedAt: null, suspendedReason: null },
          ...withCategories,
        });
        await appendAudit(tx, audit);
        return toRow(row);
      }),

    async removeStaff(accountId) {
      const { count } = await prisma.staffPermission.deleteMany({ where: { accountId } });
      return count > 0;
    },

    async suspendStaff({ accountId, reason, at }) {
      const { count } = await prisma.staffPermission.updateMany({
        where: { accountId, status: 'active' },
        data: { status: 'suspended', suspendedAt: at, suspendedReason: reason },
      });
      return count > 0;
    },

    findCurrentConfig: () => prisma.configVersion.findFirst({ orderBy: { version: 'desc' } }),
    findConfigVersion: (version) => prisma.configVersion.findUnique({ where: { version } }),

    seedConfigVersion: (values, createdBy, at) =>
      prisma
        .$transaction(async (tx) => {
          if ((await tx.configVersion.count()) > 0) return null;
          return tx.configVersion.create({
            data: { version: 1, values, createdBy, createdAt: at },
          });
        })
        .catch(lostVersionRace),

    createConfigVersion: ({ baseVersion, values, note, createdBy, at, audit }) =>
      prisma
        .$transaction(async (tx) => {
          const current = await tx.configVersion.findFirst({ orderBy: { version: 'desc' } });
          if (!current || current.version !== baseVersion) return null;
          const row = await tx.configVersion.create({
            data: { version: baseVersion + 1, values, note, createdBy, createdAt: at },
          });
          if (audit) await appendAudit(tx, audit);
          return row;
        })
        .catch(lostVersionRace),

    async queryAudit({ actorId, targetType, targetId, from, to, skip, take }) {
      const where: Prisma.AuditLogWhereInput = {
        ...(actorId === undefined ? {} : { actorId }),
        ...(targetType === undefined ? {} : { targetType }),
        ...(targetId === undefined ? {} : { targetId }),
        ...(from === undefined && to === undefined
          ? {}
          : {
              createdAt: {
                ...(from === undefined ? {} : { gte: from }),
                ...(to === undefined ? {} : { lte: to }),
              },
            }),
      };
      const [items, total] = await Promise.all([
        // `created_at` do DB ghi nên hai dòng có thể trùng mili-giây; `id` là uuidv7, tăng theo thời gian.
        prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
        }),
        prisma.auditLog.count({ where }),
      ]);
      return { items, total };
    },
  };
}
