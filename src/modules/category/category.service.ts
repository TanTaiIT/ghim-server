import { readFileSync } from 'node:fs';

import { auditActor } from '../../common/audit/audit.js';
import type { Actor } from '../../common/auth/actor.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { fold } from '../../common/text/fold.js';
import type {
  CategoryRepository,
  CategoryRow,
  CategorySettingsInput,
  CategorySettingVersion,
  Province,
  RegionsSeed,
  TemplateVersion,
  Ward,
  WardWithProvince,
} from './category.repository.js';
import { REGION_SEARCH_LIMIT } from './category.schema.js';
import { lockedFieldIssue, type TemplateField } from './template.calc.js';

export interface CategoryServiceDeps {
  repository: CategoryRepository;
  clock: () => Date;
}

export interface CategorySettingsDto extends CategorySettingsInput {
  version: number;
  changedBy: string;
  createdAt: string;
}

export interface PublicCategoryDto {
  id: string;
  name: string;
  templateVersion: number | null;
}

export interface CategoryAdminDto extends PublicCategoryDto {
  status: CategoryRow['status'];
  settings: CategorySettingsDto;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDraftDto {
  categoryId: string;
  draftVersion: number;
  fields: TemplateField[];
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface TemplateDto {
  categoryId: string;
  version: number | null;
  fields: TemplateField[];
  publishedAt: string | null;
}

export interface SaveDraftInput {
  baseDraftVersion: number;
  fields: TemplateField[];
  version?: number | undefined;
}

export interface ProvinceDto {
  code: number;
  name: string;
  fullName: string;
  formerNames: string[];
  aliases: string[];
}

export interface WardDto {
  code: number;
  provinceCode: number;
  name: string;
  formerNames: string[];
}

export interface RegionHitDto {
  kind: 'province' | 'ward';
  code: number;
  name: string;
  provinceCode: number;
  provinceName: string;
  formerNames: string[];
}

export interface CategoryService {
  create(actor: Actor, input: { name: string } & CategorySettingsInput): Promise<CategoryAdminDto>;
  rename(actor: Actor, id: string, name: string): Promise<CategoryAdminDto>;
  updateSettings(
    actor: Actor,
    id: string,
    settings: CategorySettingsInput,
  ): Promise<CategoryAdminDto>;
  setStatus(actor: Actor, id: string, status: CategoryRow['status']): Promise<CategoryAdminDto>;
  listPublic(): Promise<PublicCategoryDto[]>;
  listAdmin(): Promise<CategoryAdminDto[]>;
  getSettingsVersion(id: string, version: number): Promise<CategorySettingsDto>;

  /** Cửa đọc cho `platform` (kiểm grant) — đọc, không ghi (design 5). */
  existingIds(ids: string[]): Promise<Set<string>>;
  /** Cửa đọc cho `screening` sau này: cài đặt hiện hành kèm số phiên bản. */
  settingsOf(id: string): Promise<CategorySettingsDto>;

  getDraft(id: string): Promise<TemplateDraftDto>;
  saveDraft(actor: Actor, id: string, input: SaveDraftInput): Promise<TemplateDraftDto>;
  discardDraft(actor: Actor, id: string): Promise<void>;
  publish(actor: Actor, id: string): Promise<TemplateDto>;
  currentTemplate(id: string): Promise<TemplateDto>;
  templateVersion(id: string, version: number): Promise<TemplateDto>;

  listProvinces(): Promise<ProvinceDto[]>;
  listWards(provinceCode: number): Promise<WardDto[]>;
  searchRegions(query: string): Promise<RegionHitDto[]>;
  /** Nạp `data/regions.json` khi bảng tỉnh rỗng — chạy lúc khởi động, idempotent. */
  seedRegionsIfEmpty(): Promise<{ provinces: number; wards: number }>;
}

function toSettingsDto(row: CategorySettingVersion): CategorySettingsDto {
  return {
    version: row.version,
    priceCap: row.priceCap,
    referencePrice: row.referencePrice,
    riskLevel: row.riskLevel,
    alwaysManual: row.alwaysManual,
    groupReview: row.groupReview,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPublicDto(row: CategoryRow): PublicCategoryDto {
  return { id: row.id, name: row.name, templateVersion: row.templateVersion };
}

function toAdminDto(row: CategoryRow): CategoryAdminDto {
  return {
    ...toPublicDto(row),
    status: row.status,
    settings: toSettingsDto(row.settings),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `fields` ghi qua Zod nên đọc lại tin được; cast một chỗ thay vì parse lại ở mọi lượt đọc. */
const fieldsOf = (row: { fields: unknown }): TemplateField[] => row.fields as TemplateField[];

function toTemplateDto(row: TemplateVersion): TemplateDto {
  return {
    categoryId: row.categoryId,
    version: row.version,
    fields: fieldsOf(row),
    publishedAt: row.publishedAt.toISOString(),
  };
}

const toProvinceDto = ({ code, name, fullName, formerNames, aliases }: Province): ProvinceDto => ({
  code,
  name,
  fullName,
  formerNames,
  aliases,
});

const toWardDto = ({ code, provinceCode, name, formerNames }: Ward): WardDto => ({
  code,
  provinceCode,
  name,
  formerNames,
});

const provinceHit = (row: Province): RegionHitDto => ({
  kind: 'province',
  code: row.code,
  name: row.name,
  provinceCode: row.code,
  provinceName: row.name,
  formerNames: row.formerNames,
});

const wardHit = (row: WardWithProvince): RegionHitDto => ({
  kind: 'ward',
  code: row.code,
  name: row.name,
  provinceCode: row.provinceCode,
  provinceName: row.province.name,
  formerNames: row.formerNames,
});

const settingsInput = (settings: CategorySettingsInput): CategorySettingsInput => ({
  priceCap: settings.priceCap,
  referencePrice: settings.referencePrice,
  riskLevel: settings.riskLevel,
  alwaysManual: settings.alwaysManual,
  groupReview: settings.groupReview,
});

export function createCategoryService({ repository, clock }: CategoryServiceDeps): CategoryService {
  const categoryOf = async (id: string): Promise<CategoryRow> => {
    const row = await repository.findById(id);
    if (!row) throw new NotFoundError('Không có danh mục này');
    return row;
  };

  /** Kiểm trước để báo rõ tên nào trùng; hai lượt chen nhau thì unique của DB vẫn chặn (409). */
  const assertNameFree = async (name: string, selfId?: string): Promise<void> => {
    const owner = await repository.findIdByName(name);
    if (owner !== null && owner !== selfId) {
      throw new ConflictError(`Đã có danh mục tên "${name}"`);
    }
  };

  const currentTemplate = async (id: string): Promise<TemplateDto> => {
    const category = await categoryOf(id);
    if (category.templateVersion === null) {
      return { categoryId: id, version: null, fields: [], publishedAt: null };
    }
    const row = await repository.findTemplateVersion(id, category.templateVersion);
    if (!row)
      throw new Error(`Danh mục ${id} trỏ phiên bản mẫu ${category.templateVersion} không có`);
    return toTemplateDto(row);
  };

  return {
    async create(actor, { name, ...settings }) {
      await assertNameFree(name);
      const row = await repository.create({
        name,
        settings: settingsInput(settings),
        createdBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.category.create',
          targetType: 'category',
          targetId: '',
          details: { name },
        },
      });
      return toAdminDto(row);
    },

    async rename(actor, id, name) {
      const before = await categoryOf(id);
      await assertNameFree(name, id);
      const row = await repository.rename({
        id,
        name,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.category.rename',
          targetType: 'category',
          targetId: id,
          details: { from: before.name, to: name },
        },
      });
      return toAdminDto(row);
    },

    async updateSettings(actor, id, settings) {
      await categoryOf(id);
      const row = await repository.addSettingsVersion({
        id,
        settings: settingsInput(settings),
        changedBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.settings.change',
          targetType: 'category',
          targetId: id,
          details: {
            priceCap: settings.priceCap === null ? null : String(settings.priceCap),
            referencePrice:
              settings.referencePrice === null ? null : String(settings.referencePrice),
            riskLevel: settings.riskLevel,
            alwaysManual: settings.alwaysManual,
            groupReview: settings.groupReview,
          },
        },
      });
      return toAdminDto(row);
    },

    async setStatus(actor, id, status) {
      const before = await categoryOf(id);
      if (before.status === status) return toAdminDto(before);
      const row = await repository.setStatus({
        id,
        status,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: status === 'active' ? 'category.category.enable' : 'category.category.disable',
          targetType: 'category',
          targetId: id,
        },
      });
      return toAdminDto(row);
    },

    async listPublic() {
      return (await repository.list({ status: 'active' })).map(toPublicDto);
    },
    async listAdmin() {
      return (await repository.list({})).map(toAdminDto);
    },
    async getSettingsVersion(id, version) {
      await categoryOf(id);
      const row = await repository.findSettingsVersion(id, version);
      if (!row) throw new NotFoundError(`Không có phiên bản cài đặt ${version}`);
      return toSettingsDto(row);
    },

    existingIds: (ids) => repository.existingIds(ids),
    async settingsOf(id) {
      return toSettingsDto((await categoryOf(id)).settings);
    },

    // ── MẪU THÔNG TIN ───────────────────────────────────────────────────────────────────────────

    async getDraft(id) {
      const draft = await repository.findDraft(id);
      if (draft) {
        return {
          categoryId: id,
          draftVersion: draft.draftVersion,
          fields: fieldsOf(draft),
          updatedBy: draft.updatedBy,
          updatedAt: draft.updatedAt.toISOString(),
        };
      }
      const current = await currentTemplate(id);
      return {
        categoryId: id,
        draftVersion: 0,
        fields: current.fields,
        updatedBy: null,
        updatedAt: null,
      };
    },

    async saveDraft(actor, id, { baseDraftVersion, fields, version }) {
      await categoryOf(id);
      if (version !== undefined) {
        throw new ConflictError(
          `Phiên bản mẫu ${version} đã phát hành, không sửa được — sửa bản nháp rồi phát hành phiên bản kế`,
          'TEMPLATE_PUBLISHED',
        );
      }
      const published = (await repository.listTemplateVersions(id)).map(fieldsOf);
      const locked = lockedFieldIssue(published, fields);
      if (locked) throw new ConflictError(locked, 'TEMPLATE_FIELD_NAME_LOCKED');

      const row = await repository.saveDraft({
        id,
        baseDraftVersion,
        fields,
        updatedBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.template.save_draft',
          targetType: 'category',
          targetId: id,
          details: { draftVersion: baseDraftVersion + 1, fieldCount: fields.length },
        },
      });
      if (!row) {
        throw new ConflictError('Bản nháp đã được người khác lưu — tải lại rồi sửa tiếp');
      }
      return {
        categoryId: id,
        draftVersion: row.draftVersion,
        fields: fieldsOf(row),
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async discardDraft(actor, id) {
      await categoryOf(id);
      const deleted = await repository.deleteDraft({
        id,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.template.discard_draft',
          targetType: 'category',
          targetId: id,
        },
      });
      if (!deleted) throw new NotFoundError('Danh mục này không có bản nháp');
    },

    async publish(actor, id) {
      const category = await categoryOf(id);
      const draft = await repository.findDraft(id);
      if (!draft) throw new NotFoundError('Danh mục này không có bản nháp để phát hành');
      const version = (category.templateVersion ?? 0) + 1;
      const row = await repository.publishTemplate({
        id,
        version,
        draftVersion: draft.draftVersion,
        fields: fieldsOf(draft),
        publishedBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'category.template.publish',
          targetType: 'category',
          targetId: id,
          details: { version, fieldCount: fieldsOf(draft).length },
        },
      });
      if (!row) {
        throw new ConflictError('Bản nháp vừa được sửa — tải lại, xem lại rồi phát hành');
      }
      return toTemplateDto(row);
    },

    currentTemplate,

    async templateVersion(id, version) {
      await categoryOf(id);
      const row = await repository.findTemplateVersion(id, version);
      if (!row) throw new NotFoundError(`Không có phiên bản mẫu ${version}`);
      return toTemplateDto(row);
    },

    // ── KHU VỰC ─────────────────────────────────────────────────────────────────────────────────

    async listProvinces() {
      return (await repository.listProvinces()).map(toProvinceDto);
    },
    async listWards(provinceCode) {
      if (!(await repository.findProvince(provinceCode))) {
        throw new NotFoundError('Không có tỉnh, thành này');
      }
      return (await repository.listWards(provinceCode)).map(toWardDto);
    },
    async searchRegions(query) {
      const folded = fold(query);
      if (folded.length === 0) return [];
      const { provinces, wards } = await repository.searchRegions(folded, REGION_SEARCH_LIMIT);
      return [...provinces.map(provinceHit), ...wards.map(wardHit)];
    },
    async seedRegionsIfEmpty() {
      if ((await repository.countProvinces()) > 0) return { provinces: 0, wards: 0 };
      const seed = JSON.parse(
        readFileSync(new URL('./data/regions.json', import.meta.url), 'utf8'),
      ) as RegionsSeed;
      return repository.seedRegions(seed);
    },
  };
}
