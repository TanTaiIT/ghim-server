import type {
  Category,
  CategorySettingVersion,
  CategoryStatus,
  Prisma,
  PrismaClient,
  Province,
  TemplateDraft,
  TemplateVersion,
  Ward,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { fold } from '../../common/text/fold.js';
import { fieldsToJson, type TemplateField } from './template.calc.js';

export type {
  Category,
  CategorySettingVersion,
  CategoryStatus,
  Province,
  TemplateDraft,
  TemplateVersion,
  Ward,
};

/** Danh mục kèm dòng cài đặt hiện hành (`version = settings_version`). */
export type CategoryRow = Category & { settings: CategorySettingVersion };

export type WardWithProvince = Ward & { province: Province };

export type CategorySettingsInput = Pick<
  CategorySettingVersion,
  'priceCap' | 'referencePrice' | 'riskLevel' | 'alwaysManual' | 'groupReview'
>;

export interface RegionsSeed {
  provinces: Array<Pick<Province, 'code' | 'name' | 'fullName' | 'formerNames' | 'aliases'>>;
  wards: Array<Pick<Ward, 'code' | 'provinceCode' | 'name' | 'formerNames'>>;
}

export interface Audited {
  at: Date;
  audit: AuditEntry;
}

export interface CategoryRepository {
  findById(id: string): Promise<CategoryRow | null>;
  findIdByName(name: string): Promise<string | null>;
  list(filter: { status?: CategoryStatus }): Promise<CategoryRow[]>;
  existingIds(ids: string[]): Promise<Set<string>>;
  /** Danh mục + phiên bản cài đặt 1 trong một transaction. Tên trùng: P2002. */
  create(
    input: { name: string; settings: CategorySettingsInput; createdBy: string } & Audited,
  ): Promise<CategoryRow>;
  rename(input: { id: string; name: string } & Audited): Promise<CategoryRow>;
  setStatus(input: { id: string; status: CategoryStatus } & Audited): Promise<CategoryRow>;
  /** Phiên bản kế + tăng `settings_version` cùng transaction; phiên bản cũ không đụng. */
  addSettingsVersion(
    input: { id: string; settings: CategorySettingsInput; changedBy: string } & Audited,
  ): Promise<CategoryRow>;
  findSettingsVersion(id: string, version: number): Promise<CategorySettingVersion | null>;

  findDraft(id: string): Promise<TemplateDraft | null>;
  /** Khoá lạc quan: `baseDraftVersion` phải bằng nháp hiện có (0 = chưa có). Lệch thì `null`. */
  saveDraft(
    input: {
      id: string;
      baseDraftVersion: number;
      fields: TemplateField[];
      updatedBy: string;
    } & Audited,
  ): Promise<TemplateDraft | null>;
  /** `false` khi không có nháp để bỏ. */
  deleteDraft(input: { id: string } & Audited): Promise<boolean>;
  listTemplateVersions(id: string): Promise<TemplateVersion[]>;
  findTemplateVersion(id: string, version: number): Promise<TemplateVersion | null>;
  /**
   * Tạo phiên bản, xoá nháp, cập nhật `template_version` — một transaction. `null` khi bản nháp
   * không còn là số `draftVersion` đã đọc (ai đó vừa lưu bản mới hơn): khi đó không gì được ghi.
   * Phiên bản trùng (hai lượt phát hành cùng lúc): P2002.
   */
  publishTemplate(
    input: {
      id: string;
      version: number;
      draftVersion: number;
      fields: TemplateField[];
      publishedBy: string;
    } & Audited,
  ): Promise<TemplateVersion | null>;

  countProvinces(): Promise<number>;
  /** Nạp cả file một lượt; `search_text` dựng ở đây để cùng hàm `fold` với lúc tìm. */
  seedRegions(seed: RegionsSeed): Promise<{ provinces: number; wards: number }>;
  listProvinces(): Promise<Province[]>;
  findProvince(code: number): Promise<Province | null>;
  listWards(provinceCode: number): Promise<Ward[]>;
  /** `folded` đã qua `fold`; tỉnh và phường tìm riêng, mỗi bên tới `limit` dòng. */
  searchRegions(
    folded: string,
    limit: number,
  ): Promise<{ provinces: Province[]; wards: WardWithProvince[] }>;
}

/** 5 tham số một dòng phường → 5000 mỗi lô, dưới xa trần 65535 của Postgres. */
const WARD_BATCH_SIZE = 1_000;

export function provinceSearchText(
  row: Pick<Province, 'name' | 'fullName' | 'formerNames' | 'aliases'>,
): string {
  return fold([row.name, row.fullName, ...row.formerNames, ...row.aliases].join(' | '));
}

export function wardSearchText(row: Pick<Ward, 'name' | 'formerNames'>): string {
  return fold([row.name, ...row.formerNames].join(' | '));
}

type Tx = Prisma.TransactionClient;

async function currentRow(tx: Tx, id: string): Promise<CategoryRow> {
  const category = await tx.category.findUniqueOrThrow({ where: { id } });
  const settings = await tx.categorySettingVersion.findUniqueOrThrow({
    where: { categoryId_version: { categoryId: id, version: category.settingsVersion } },
  });
  return { ...category, settings };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

export function createCategoryRepository(prisma: PrismaClient): CategoryRepository {
  const withCurrent = async (categories: Category[]): Promise<CategoryRow[]> => {
    if (categories.length === 0) return [];
    const settings = await prisma.categorySettingVersion.findMany({
      where: {
        OR: categories.map((row) => ({ categoryId: row.id, version: row.settingsVersion })),
      },
    });
    const byCategory = new Map(settings.map((row) => [row.categoryId, row]));
    return categories.map((row) => {
      const current = byCategory.get(row.id);
      if (!current) throw new Error(`Danh mục ${row.id} thiếu dòng cài đặt ${row.settingsVersion}`);
      return { ...row, settings: current };
    });
  };

  return {
    async findById(id) {
      const category = await prisma.category.findUnique({ where: { id } });
      return category ? ((await withCurrent([category]))[0] ?? null) : null;
    },
    async findIdByName(name) {
      const row = await prisma.category.findUnique({ where: { name }, select: { id: true } });
      return row?.id ?? null;
    },
    async list({ status }) {
      const rows = await prisma.category.findMany({
        where: status === undefined ? {} : { status },
        orderBy: { name: 'asc' },
      });
      return withCurrent(rows);
    },
    async existingIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await prisma.category.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },

    create: ({ name, settings, createdBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: {
            name,
            createdBy,
            createdAt: at,
            updatedAt: at,
            settingVersions: {
              create: { version: 1, ...settings, changedBy: createdBy, createdAt: at },
            },
          },
        });
        await appendAudit(tx, { ...audit, targetId: category.id });
        return currentRow(tx, category.id);
      }),

    rename: ({ id, name, at, audit }) =>
      prisma.$transaction(async (tx) => {
        await tx.category.update({ where: { id }, data: { name, updatedAt: at } });
        await appendAudit(tx, audit);
        return currentRow(tx, id);
      }),

    setStatus: ({ id, status, at, audit }) =>
      prisma.$transaction(async (tx) => {
        await tx.category.update({ where: { id }, data: { status, updatedAt: at } });
        await appendAudit(tx, audit);
        return currentRow(tx, id);
      }),

    addSettingsVersion: ({ id, settings, changedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id } });
        const version = category.settingsVersion + 1;
        await tx.categorySettingVersion.create({
          data: { categoryId: id, version, ...settings, changedBy, createdAt: at },
        });
        await tx.category.update({
          where: { id },
          data: { settingsVersion: version, updatedAt: at },
        });
        await appendAudit(tx, audit);
        return currentRow(tx, id);
      }),

    findSettingsVersion: (categoryId, version) =>
      prisma.categorySettingVersion.findUnique({
        where: { categoryId_version: { categoryId, version } },
      }),

    findDraft: (categoryId) => prisma.templateDraft.findUnique({ where: { categoryId } }),

    saveDraft: ({ id, baseDraftVersion, fields, updatedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const data = {
          fields: fieldsToJson(fields),
          draftVersion: baseDraftVersion + 1,
          updatedBy,
          updatedAt: at,
        };
        if (baseDraftVersion === 0) {
          if (
            await tx.templateDraft.findUnique({
              where: { categoryId: id },
              select: { categoryId: true },
            })
          ) {
            return null;
          }
          // Hai lượt cùng thấy "chưa có nháp" thì PK chặn lượt sau (P2002 → 409).
          await tx.templateDraft.create({ data: { categoryId: id, ...data } });
        } else {
          // Ghi có điều kiện, không đọc-rồi-ghi: hai lượt cùng sửa từ một số nháp thì đúng một lượt
          // khớp điều kiện, lượt kia thấy 0 dòng (rà soát 10/10/2026).
          const { count } = await tx.templateDraft.updateMany({
            where: { categoryId: id, draftVersion: baseDraftVersion },
            data,
          });
          if (count === 0) return null;
        }
        await appendAudit(tx, audit);
        return tx.templateDraft.findUniqueOrThrow({ where: { categoryId: id } });
      }),

    deleteDraft: ({ id, audit }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.templateDraft.deleteMany({ where: { categoryId: id } });
        if (count === 0) return false;
        await appendAudit(tx, audit);
        return true;
      }),

    listTemplateVersions: (categoryId) =>
      prisma.templateVersion.findMany({ where: { categoryId }, orderBy: { version: 'asc' } }),
    findTemplateVersion: (categoryId, version) =>
      prisma.templateVersion.findUnique({ where: { categoryId_version: { categoryId, version } } }),

    publishTemplate: ({ id, version, draftVersion, fields, publishedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        // Xoá trước, có điều kiện: bản nháp vừa được lưu sau lúc đọc thì không bị xoá mất mà
        // cũng không bị phát hành thay cho bản master đã xem.
        const { count } = await tx.templateDraft.deleteMany({
          where: { categoryId: id, draftVersion },
        });
        if (count === 0) return null;
        const row = await tx.templateVersion.create({
          data: {
            categoryId: id,
            version,
            fields: fieldsToJson(fields),
            publishedBy,
            publishedAt: at,
          },
        });
        await tx.category.update({
          where: { id },
          data: { templateVersion: version, updatedAt: at },
        });
        await appendAudit(tx, audit);
        return row;
      }),

    countProvinces: () => prisma.province.count(),

    async seedRegions({ provinces, wards }) {
      const provinceResult = await prisma.province.createMany({
        data: provinces.map((row) => ({ ...row, searchText: provinceSearchText(row) })),
        skipDuplicates: true,
      });
      const wardResults = await Promise.all(
        chunk(wards, WARD_BATCH_SIZE).map((batch) =>
          prisma.ward.createMany({
            data: batch.map((row) => ({ ...row, searchText: wardSearchText(row) })),
            skipDuplicates: true,
          }),
        ),
      );
      return {
        provinces: provinceResult.count,
        wards: wardResults.reduce((sum, { count }) => sum + count, 0),
      };
    },
    listProvinces: () => prisma.province.findMany({ orderBy: { code: 'asc' } }),
    findProvince: (code) => prisma.province.findUnique({ where: { code } }),
    listWards: (provinceCode) =>
      prisma.ward.findMany({ where: { provinceCode }, orderBy: { code: 'asc' } }),
    async searchRegions(folded, limit) {
      const [provinces, wards] = await Promise.all([
        prisma.province.findMany({
          where: { searchText: { contains: folded } },
          orderBy: { code: 'asc' },
          take: limit,
        }),
        prisma.ward.findMany({
          where: { searchText: { contains: folded } },
          orderBy: { code: 'asc' },
          take: limit,
          include: { province: true },
        }),
      ]);
      return { provinces, wards };
    },
  };
}
