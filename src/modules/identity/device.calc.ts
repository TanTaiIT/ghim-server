import { hmacHex } from '../../common/crypto/secrets.js';
import type { AccountFlagKind } from './identity.schema.js';

export interface DevicePostRow {
  accountId: string;
  firstPostedAt: Date;
  lastPostedAt: Date;
}

export interface LockedAccountRow {
  accountId: string;
  lockedAt: Date;
}

export interface ClearanceRow {
  accountId: string;
  clearedAt: Date;
}

export interface DeviceFlagInput {
  /** Tài khoản vừa gửi tin — dòng `device_posts` của nó đã được upsert trước khi tính. */
  accountId: string;
  now: Date;
  /** `identity.deviceWindowDays` — chỉ lượt đăng trong cửa sổ này mới chiếm chỗ. */
  windowDays: number;
  /** `identity.deviceSlots` — số tài khoản đầu tiên trên máy không bị đánh dấu. */
  slots: number;
  /** Mọi dòng `device_posts` của máy này. */
  posts: DevicePostRow[];
  /** Tài khoản ĐANG bị khoá từng đăng tin trên máy này, kèm lúc khoá. */
  lockedAccounts: LockedAccountRow[];
  /** Miễn trừ hỗ trợ đã cấp trên máy này. */
  clearances: ClearanceRow[];
}

export type RequiredFlag =
  | { kind: Extract<AccountFlagKind, 'many_accounts_on_device'>; relatedAccountId: null }
  | { kind: Extract<AccountFlagKind, 'device_of_locked_account'>; relatedAccountId: string };

const DAY_MS = 86_400_000;

/** Mã thiết bị app gửi lên không bao giờ vào DB — chỉ dấu băm (TK 8, CLAUDE.md luật 21). */
export function hashDeviceId(deviceId: string, key: string): string {
  return hmacHex(key, 'device', deviceId);
}

/**
 * Tập đánh dấu PHẢI CÓ của tài khoản vừa gửi tin, tính lại từ đầu mỗi lượt (spec device-registry).
 * Service so tập này với tập đang mở rồi tạo / đóng dòng `account_flags`; hàm này không biết DB.
 *
 * Thứ tự chỗ theo `firstPostedAt`, nên tài khoản cũ quay lại vẫn giữ chỗ; chỉ tính lượt đăng
 * trong cửa sổ, nên một chỗ trống ra khi tài khoản cũ im lặng đủ lâu. Miễn trừ của hỗ trợ (máy
 * mua lại) bỏ qua những tài khoản — và những lần khoá — có trước lúc cấp miễn trừ: chủ cũ không
 * còn đè lên chủ mới, nhưng một tài khoản khác bị khoá SAU đó vẫn bị tính.
 */
export function requiredDeviceFlags(input: DeviceFlagInput): RequiredFlag[] {
  const { accountId, now, windowDays, slots, posts, lockedAccounts, clearances } = input;
  const own = posts.find((post) => post.accountId === accountId);
  if (!own) return [];

  const clearedAt = clearances.find((row) => row.accountId === accountId)?.clearedAt ?? null;
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const flags: RequiredFlag[] = [];

  const contenders = posts
    .filter((post) => post.lastPostedAt >= windowStart)
    .filter((post) => post.accountId === accountId || !clearedAt || post.firstPostedAt >= clearedAt)
    .toSorted(
      (a, b) =>
        a.firstPostedAt.getTime() - b.firstPostedAt.getTime() ||
        a.accountId.localeCompare(b.accountId),
    );
  if (contenders.findIndex((post) => post.accountId === accountId) >= slots) {
    flags.push({ kind: 'many_accounts_on_device', relatedAccountId: null });
  }

  for (const locked of lockedAccounts) {
    if (locked.accountId === accountId) continue;
    // Đã đăng tin trước lúc khoá = người nhà dùng chung máy, không phải tài khoản lập để né khoá.
    if (own.firstPostedAt <= locked.lockedAt) continue;
    if (clearedAt && locked.lockedAt < clearedAt) continue;
    flags.push({ kind: 'device_of_locked_account', relatedAccountId: locked.accountId });
  }

  return flags;
}
