import { fold } from '../../common/text/fold.js';

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

const RESERVED_FOLDED: ReadonlySet<string> = new Set(RESERVED_NAMES.map(fold));

export function isReservedName(name: string): boolean {
  return RESERVED_FOLDED.has(fold(name));
}
