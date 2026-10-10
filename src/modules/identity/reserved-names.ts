/** Tên dành cho bộ phận quản lý (TK 7): người dùng không được mạo danh, so sau khi bỏ dấu và hoa. */
const RESERVED_NAMES = [
  'Quản trị hệ thống',
  'Quản trị viên',
  'Ban quản trị',
  'Hệ thống',
  'Hỗ trợ',
  'Hỗ trợ Ghim',
  'Nhân viên Ghim',
  'Ghim',
  'Admin',
  'Administrator',
  'Moderator',
  'Support',
  'Staff',
  'System',
];

/** Bỏ dấu (kể cả đ), hoa toàn bộ, gộp khoảng trắng — "quan  tri he thong" và "Quản trị hệ thống" là một. */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const RESERVED_FOLDED: ReadonlySet<string> = new Set(RESERVED_NAMES.map(foldName));

export function isReservedName(name: string): boolean {
  return RESERVED_FOLDED.has(foldName(name));
}
