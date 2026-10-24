import { readFileSync } from 'node:fs';

import { NotFoundError } from '../../common/errors/app-error.js';
import { fold } from '../../common/text/fold.js';
import type {
  Province,
  RegionRepository,
  RegionsSeed,
  Ward,
  WardWithProvince,
} from './region.repository.js';
import { REGION_SEARCH_LIMIT } from './region.schema.js';

/*
 * Khu vực hành chính (TK 11): 34 tỉnh, 3.321 phường sau sáp nhập, tên cũ, tìm bỏ dấu. Tách khỏi `category`
 * 24/10/2026: `listing` kiểm cặp tỉnh / phường và app lọc theo khu vực mà không liên quan gì tới danh mục, nên đặt
 * chung chỉ làm `category` phình. Spec vẫn là `category/regions` — hành vi không đổi.
 */

export interface RegionServiceDeps {
  repository: RegionRepository;
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

export interface RegionService {
  listProvinces(): Promise<ProvinceDto[]>;
  listWards(provinceCode: number): Promise<WardDto[]>;
  searchRegions(query: string): Promise<RegionHitDto[]>;
  /** Cửa cho `listing`: lỗi của cặp tỉnh / phường (mã lạ, phường không thuộc tỉnh); `null` = hợp lệ. */
  validateRegion(provinceCode: number, wardCode: number | null): Promise<string | null>;
  /** Nạp `data/regions.json` khi bảng tỉnh rỗng — chạy lúc khởi động, idempotent. */
  seedRegionsIfEmpty(): Promise<{ provinces: number; wards: number }>;
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

export function createRegionService({ repository }: RegionServiceDeps): RegionService {
  return {
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

    async validateRegion(provinceCode, wardCode) {
      if (!(await repository.provinceExists(provinceCode))) return 'Không có tỉnh / thành này';
      if (wardCode === null) return null;
      const ward = await repository.findWard(wardCode);
      if (!ward) return 'Không có phường / xã này';
      return ward.provinceCode === provinceCode
        ? null
        : 'Phường / xã không thuộc tỉnh / thành đã chọn';
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
