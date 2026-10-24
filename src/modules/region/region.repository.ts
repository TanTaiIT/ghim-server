import type { PrismaClient, Province, Ward } from '@prisma/client';

import { fold } from '../../common/text/fold.js';

export type { Province, Ward };

export type WardWithProvince = Ward & { province: Province };

export interface RegionsSeed {
  provinces: Array<Pick<Province, 'code' | 'name' | 'fullName' | 'formerNames' | 'aliases'>>;
  wards: Array<Pick<Ward, 'code' | 'provinceCode' | 'name' | 'formerNames'>>;
}

export interface RegionRepository {
  findWard(code: number): Promise<{ provinceCode: number } | null>;
  provinceExists(code: number): Promise<boolean>;
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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

export function createRegionRepository(prisma: PrismaClient): RegionRepository {
  return {
    findWard: (code) => prisma.ward.findUnique({ where: { code }, select: { provinceCode: true } }),

    async provinceExists(code) {
      return (await prisma.province.count({ where: { code } })) > 0;
    },

    countProvinces: () => prisma.province.count(),

    async seedRegions({ provinces, wards }) {
      // Một transaction, các lô chạy lần lượt trên một kết nối: nạp hỏng giữa chừng thì không để lại tỉnh
      // thiếu phường khiến lần khởi động sau bỏ qua, và không chiếm cả pool của request.
      const [provinceResult, ...wardResults] = await prisma.$transaction([
        prisma.province.createMany({
          data: provinces.map((row) => ({ ...row, searchText: provinceSearchText(row) })),
          skipDuplicates: true,
        }),
        ...chunk(wards, WARD_BATCH_SIZE).map((batch) =>
          prisma.ward.createMany({
            data: batch.map((row) => ({ ...row, searchText: wardSearchText(row) })),
            skipDuplicates: true,
          }),
        ),
      ]);
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
