import { readFileSync, writeFileSync } from 'node:fs';

import { fold } from '../common/text/fold.js';

/*
 * Sinh `src/modules/category/data/regions.json` — nguồn mã số chính thức là API công khai
 * provinces.open-api.vn (v2 = sau sáp nhập 01/07/2025, depth=2 = tỉnh kèm phường); tên cũ và tên
 * gọi tắt cấp tỉnh trộn từ `province-former-names.json` (biên soạn tay, chép từ hệ thống cũ).
 *
 *   pnpm cli:build-regions                 # tải API
 *   pnpm cli:build-regions --from file.json  # dùng bản API đã tải (không mạng)
 *
 * Cập nhật địa giới = chạy lại, đọc diff của regions.json, commit. Script dừng với lỗi khi dữ liệu
 * không khớp kỳ vọng (34 tỉnh, mã trùng, tỉnh không có trong bảng tên cũ) thay vì ghi file lệch.
 */
const API_URL = 'https://provinces.open-api.vn/api/v2/?depth=2';
const EXPECTED_PROVINCES = 34;
const DATA_DIR = new URL('../modules/category/data/', import.meta.url);

interface ApiWard {
  code: number;
  name: string;
}

interface ApiProvince {
  code: number;
  name: string;
  wards: ApiWard[];
}

interface FormerNames {
  formerNames: string[];
  aliases: string[];
}

export interface RegionProvince {
  code: number;
  name: string;
  fullName: string;
  formerNames: string[];
  aliases: string[];
}

export interface RegionWard {
  code: number;
  provinceCode: number;
  name: string;
  formerNames: string[];
}

export interface RegionsFile {
  provinces: RegionProvince[];
  wards: RegionWard[];
}

/** "Thành phố Hà Nội" → "Hà Nội", "Tỉnh Cao Bằng" → "Cao Bằng" — tên ngắn là tên hiển thị và khoá tra bảng tên cũ. */
function shortName(fullName: string): string {
  return fullName.replace(/^(Thành phố|Tỉnh)\s+/u, '');
}

function assertUniqueCodes(label: string, codes: number[]): void {
  const seen = new Set<number>();
  for (const code of codes) {
    if (seen.has(code)) throw new Error(`${label}: mã ${code} xuất hiện hai lần`);
    seen.add(code);
  }
}

export function buildRegions(api: ApiProvince[], former: Record<string, FormerNames>): RegionsFile {
  if (api.length !== EXPECTED_PROVINCES) {
    throw new Error(`API trả ${api.length} tỉnh, kỳ vọng ${EXPECTED_PROVINCES}`);
  }
  const formerByFolded = new Map(Object.entries(former).map(([name, row]) => [fold(name), row]));
  const provinces: RegionProvince[] = api.map((province) => {
    const name = shortName(province.name);
    const extra = formerByFolded.get(fold(name));
    if (!extra) throw new Error(`Tỉnh "${name}" không có trong province-former-names.json`);
    return { code: province.code, name, fullName: province.name, ...extra };
  });
  const wards: RegionWard[] = api.flatMap((province) =>
    province.wards.map((ward) => ({
      code: ward.code,
      provinceCode: province.code,
      name: ward.name,
      formerNames: [],
    })),
  );
  assertUniqueCodes(
    'tỉnh',
    provinces.map((row) => row.code),
  );
  assertUniqueCodes(
    'phường',
    wards.map((row) => row.code),
  );
  for (const province of api) {
    const names = new Set<string>();
    for (const ward of province.wards) {
      if (names.has(ward.name)) throw new Error(`${province.name}: "${ward.name}" hai lần`);
      names.add(ward.name);
    }
  }
  return { provinces, wards };
}

async function loadApi(): Promise<ApiProvince[]> {
  const fromIndex = process.argv.indexOf('--from');
  if (fromIndex >= 0) {
    const file = process.argv[fromIndex + 1];
    if (!file) throw new Error('--from cần một đường dẫn');
    return JSON.parse(readFileSync(file, 'utf8')) as ApiProvince[];
  }
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`API trả ${response.status}`);
  return (await response.json()) as ApiProvince[];
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('/build-regions.ts');
if (isMain) {
  const former = JSON.parse(
    readFileSync(new URL('province-former-names.json', DATA_DIR), 'utf8'),
  ) as Record<string, FormerNames>;
  const regions = buildRegions(await loadApi(), former);
  writeFileSync(new URL('regions.json', DATA_DIR), `${JSON.stringify(regions)}\n`);
  process.stdout.write(
    `Đã ghi regions.json: ${regions.provinces.length} tỉnh, ${regions.wards.length} phường\n`,
  );
}
