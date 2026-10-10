import { randomUUID } from 'node:crypto';

import type { AuditLog } from '@prisma/client';

import {
  type Category,
  type CategoryRepository,
  type CategoryRow,
  type CategorySettingVersion,
  type Province,
  provinceSearchText,
  type TemplateDraft,
  type TemplateVersion,
  type Ward,
  wardSearchText,
} from '../../src/modules/category/category.repository.js';
import { fieldsToJson } from '../../src/modules/category/template.calc.js';
import { createFakeAuditLog, type FakeAuditLog } from './audit.fake.js';
import { uniqueViolation } from './unique-violation.js';

export interface FakeCategoryRepository extends CategoryRepository {
  readonly categories: Map<string, Category>;
  readonly settingVersions: Map<string, CategorySettingVersion>;
  readonly drafts: Map<string, TemplateDraft>;
  readonly templateVersions: Map<string, TemplateVersion>;
  readonly provinces: Map<number, Province>;
  readonly wards: Map<number, Ward>;
  readonly audit: AuditLog[];
}

const key = (categoryId: string, version: number): string => `${categoryId}:${version}`;

/** Cùng hình dạng với bản Prisma: giữ unique tên, PK phiên bản (P2002); CHECK là việc của test DB. */
export function createFakeCategoryRepository({
  auditLog = createFakeAuditLog(),
}: { auditLog?: FakeAuditLog } = {}): FakeCategoryRepository {
  const categories = new Map<string, Category>();
  const settingVersions = new Map<string, CategorySettingVersion>();
  const drafts = new Map<string, TemplateDraft>();
  const templateVersions = new Map<string, TemplateVersion>();
  const provinces = new Map<number, Province>();
  const wards = new Map<number, Ward>();
  const audit = auditLog.rows;

  const byId = (id: string): Category => {
    const row = categories.get(id);
    if (!row) throw new Error(`Không có danh mục ${id}`);
    return row;
  };

  const rowOf = (category: Category): CategoryRow => {
    const settings = settingVersions.get(key(category.id, category.settingsVersion));
    if (!settings) throw new Error(`Danh mục ${category.id} thiếu cài đặt`);
    return { ...category, settings };
  };

  const assertNameFree = (name: string, selfId?: string): void => {
    for (const row of categories.values()) {
      if (row.id !== selfId && row.name === name) throw uniqueViolation('categories.name');
    }
  };

  return {
    categories,
    settingVersions,
    drafts,
    templateVersions,
    provinces,
    wards,
    audit,

    findById: async (id) => {
      const row = categories.get(id);
      return row ? rowOf(row) : null;
    },
    findIdByName: async (name) =>
      [...categories.values()].find((row) => row.name === name)?.id ?? null,
    list: async ({ status }) =>
      [...categories.values()]
        .filter((row) => status === undefined || row.status === status)
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map(rowOf),
    existingIds: async (ids) => new Set(ids.filter((id) => categories.has(id))),

    async create({ name, settings, createdBy, at, audit: entry }) {
      assertNameFree(name);
      const category: Category = {
        id: randomUUID(),
        name,
        status: 'active',
        settingsVersion: 1,
        templateVersion: null,
        createdBy,
        createdAt: at,
        updatedAt: at,
      };
      categories.set(category.id, category);
      settingVersions.set(key(category.id, 1), {
        categoryId: category.id,
        version: 1,
        ...settings,
        changedBy: createdBy,
        createdAt: at,
      });
      auditLog.append({ ...entry, targetId: category.id }, at);
      return rowOf(category);
    },
    async rename({ id, name, at, audit: entry }) {
      assertNameFree(name, id);
      const row = { ...byId(id), name, updatedAt: at };
      categories.set(id, row);
      auditLog.append(entry, at);
      return rowOf(row);
    },
    async setStatus({ id, status, at, audit: entry }) {
      const row = { ...byId(id), status, updatedAt: at };
      categories.set(id, row);
      auditLog.append(entry, at);
      return rowOf(row);
    },
    async addSettingsVersion({ id, settings, changedBy, at, audit: entry }) {
      const category = byId(id);
      const version = category.settingsVersion + 1;
      if (settingVersions.has(key(id, version))) {
        throw uniqueViolation('category_setting_versions_pkey');
      }
      settingVersions.set(key(id, version), {
        categoryId: id,
        version,
        ...settings,
        changedBy,
        createdAt: at,
      });
      const row = { ...category, settingsVersion: version, updatedAt: at };
      categories.set(id, row);
      auditLog.append(entry, at);
      return rowOf(row);
    },
    findSettingsVersion: async (id, version) => settingVersions.get(key(id, version)) ?? null,

    findDraft: async (id) => drafts.get(id) ?? null,
    async saveDraft({ id, baseDraftVersion, fields, updatedBy, at, audit: entry }) {
      const existing = drafts.get(id);
      if ((existing?.draftVersion ?? 0) !== baseDraftVersion) return null;
      const row: TemplateDraft = {
        categoryId: id,
        fields: fieldsToJson(fields),
        draftVersion: baseDraftVersion + 1,
        updatedBy,
        updatedAt: at,
      };
      drafts.set(id, row);
      auditLog.append(entry, at);
      return row;
    },
    async deleteDraft({ id, at, audit: entry }) {
      if (!drafts.delete(id)) return false;
      auditLog.append(entry, at);
      return true;
    },
    listTemplateVersions: async (id) =>
      [...templateVersions.values()]
        .filter((row) => row.categoryId === id)
        .toSorted((a, b) => a.version - b.version),
    findTemplateVersion: async (id, version) => templateVersions.get(key(id, version)) ?? null,
    async publishTemplate({ id, version, draftVersion, fields, publishedBy, at, audit: entry }) {
      if (drafts.get(id)?.draftVersion !== draftVersion) return null;
      if (templateVersions.has(key(id, version))) {
        throw uniqueViolation('template_versions_pkey');
      }
      const row: TemplateVersion = {
        categoryId: id,
        version,
        fields: fieldsToJson(fields),
        publishedBy,
        publishedAt: at,
      };
      templateVersions.set(key(id, version), row);
      drafts.delete(id);
      categories.set(id, { ...byId(id), templateVersion: version, updatedAt: at });
      auditLog.append(entry, at);
      return row;
    },

    countProvinces: async () => provinces.size,
    async seedRegions(seed) {
      let provinceCount = 0;
      let wardCount = 0;
      for (const row of seed.provinces) {
        if (provinces.has(row.code)) continue;
        provinces.set(row.code, { ...row, searchText: provinceSearchText(row) });
        provinceCount += 1;
      }
      for (const row of seed.wards) {
        if (wards.has(row.code)) continue;
        wards.set(row.code, { ...row, searchText: wardSearchText(row) });
        wardCount += 1;
      }
      return { provinces: provinceCount, wards: wardCount };
    },
    listProvinces: async () => [...provinces.values()].toSorted((a, b) => a.code - b.code),
    findProvince: async (code) => provinces.get(code) ?? null,
    listWards: async (provinceCode) =>
      [...wards.values()]
        .filter((row) => row.provinceCode === provinceCode)
        .toSorted((a, b) => a.code - b.code),
    async searchRegions(folded, limit) {
      const provinceHits = [...provinces.values()]
        .filter((row) => row.searchText.includes(folded))
        .toSorted((a, b) => a.code - b.code)
        .slice(0, limit);
      const wardHits = [...wards.values()]
        .filter((row) => row.searchText.includes(folded))
        .toSorted((a, b) => a.code - b.code)
        .slice(0, limit)
        .map((row) => {
          const province = provinces.get(row.provinceCode);
          if (!province) throw new Error(`Phường ${row.code} không có tỉnh ${row.provinceCode}`);
          return { ...row, province };
        });
      return { provinces: provinceHits, wards: wardHits };
    },
  };
}
