import { randomBytes } from 'node:crypto';

import type { GroupJoinPath, GroupMode } from '@prisma/client';

const DAY_MS = 86_400_000;

/** Crockford base32 như mã tra cứu của `identity`: đọc qua điện thoại không nhầm I/L với 1, O với 0. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 256 chia hết cho 32 nên `byte % 32` phân bố đều — không lệch về ký tự đầu bảng. */
export function generateGroupCode(
  length: number,
  random: (bytes: number) => Buffer = randomBytes,
): string {
  return [...random(length)].map((byte) => CODE_ALPHABET.charAt(byte % 32)).join('');
}

export function normalizeGroupCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replaceAll('I', '1')
    .replaceAll('L', '1')
    .replaceAll('O', '0');
}

export type JoinOutcome =
  | { kind: 'member'; via: GroupJoinPath; unitId: string | null; invitationId?: string }
  | { kind: 'request' }
  | { kind: 'error'; code: 'NOT_FOUND' | 'INVITATION_REQUIRED' };

/**
 * Đường vào theo thứ tự TK 10, sau khi service đã loại nhóm không nhận người, master, thành viên sẵn và người bị
 * cấm. Lời mời và danh sách lớp đứng trước chế độ: người có tên được xét sẵn thì không phải gửi đơn. Nhóm có mã mà
 * thiếu hay sai mã trả "không tìm thấy" — nhóm riêng tư không được lộ ra cho người không có mã.
 */
export function decideJoin(input: {
  mode: GroupMode;
  invitation: { id: string; unitId: string | null } | null;
  roster: { unitId: string | null } | null;
  codeMatches: boolean;
}): JoinOutcome {
  if (input.invitation) {
    return {
      kind: 'member',
      via: 'invited',
      unitId: input.invitation.unitId,
      invitationId: input.invitation.id,
    };
  }
  if (input.roster) return { kind: 'member', via: 'roster', unitId: input.roster.unitId };
  switch (input.mode) {
    case 'public_open':
      return { kind: 'member', via: 'joined', unitId: null };
    case 'public_review':
      return { kind: 'request' };
    case 'private_code':
      return input.codeMatches ? { kind: 'request' } : { kind: 'error', code: 'NOT_FOUND' };
    case 'private_invite':
      return { kind: 'error', code: 'INVITATION_REQUIRED' };
  }
}

export type JoinRequestBlock =
  { code: 'JOIN_REQUEST_TOO_SOON'; retryAt: Date } | { code: 'JOIN_REQUEST_LIMIT' };

/** Đơn tự huỷ vì quá hạn không tính là bị từ chối (spec membership), nên chỉ lần từ chối gần nhất được đưa vào. */
export function joinRequestBlock(input: {
  lastRejectedAt: Date | null;
  pendingCount: number;
  now: Date;
  reapplyWaitDays: number;
  maxPending: number;
}): JoinRequestBlock | null {
  if (input.lastRejectedAt) {
    const retryAt = new Date(input.lastRejectedAt.getTime() + input.reapplyWaitDays * DAY_MS);
    if (retryAt > input.now) return { code: 'JOIN_REQUEST_TOO_SOON', retryAt };
  }
  if (input.pendingCount >= input.maxPending) return { code: 'JOIN_REQUEST_LIMIT' };
  return null;
}

/**
 * Lý do một tài khoản không nhận được vai chủ nhóm hay điều hành viên; `null` = nhận được. Đợt 2 thêm "từ T1",
 * đợt 5 thêm "không có gậy nặng" vào đây.
 */
export function roleIneligibility(
  account: { role: 'user' | 'master'; status: string } | undefined,
): string | null {
  if (!account || account.status === 'deleted') return 'không có tài khoản này';
  if (account.role === 'master') return 'tài khoản master không vào nhóm';
  if (account.status === 'locked') return 'tài khoản đang bị khoá';
  if (account.status !== 'active') return 'tài khoản chưa xác nhận email';
  return null;
}

export interface ModeratorCandidate {
  accountId: string;
  moderatorUnitId: string | null;
  roleSince: Date;
  joinedAt: Date;
}

/**
 * Đề cử thiếu chủ (TK 10, chốt 11/10/2026): điều hành viên cấp cả nhóm nhận vai sớm nhất, hoà thì vào nhóm sớm
 * hơn; không có ai cấp cả nhóm thì xét điều hành viên đơn vị con theo cùng thứ tự. Chỉ xét người dùng được.
 */
export function pickNominee(candidates: ModeratorCandidate[]): string | null {
  const byTenure = (a: ModeratorCandidate, b: ModeratorCandidate) =>
    a.roleSince.getTime() - b.roleSince.getTime() || a.joinedAt.getTime() - b.joinedAt.getTime();
  const whole = candidates.filter((row) => row.moderatorUnitId === null).toSorted(byTenure);
  if (whole[0]) return whole[0].accountId;
  return candidates.toSorted(byTenure)[0]?.accountId ?? null;
}
