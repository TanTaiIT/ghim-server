/** Tuple của enum `account_role` trong schema.prisma — nằm ở `common/auth` vì guard của mọi module đọc nó. */
export const ACCOUNT_ROLES = ['user', 'master'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Người đang gọi, gắn vào `request.actor` sau `authenticate`. Chỉ mang thứ guard cần — không email, không dấu băm. */
export interface Actor {
  accountId: string;
  role: AccountRole;
  sessionId: string;
  /** Phiên đã qua lớp thứ hai lúc nào; `null` = chưa, bàn vận hành từ chối. */
  secondFactorAt: Date | null;
  emailVerified: boolean;
}

/** "Người này là ai" — `identity` trả lời, mọi module hỏi qua đây (CLAUDE.md luật 12). */
export interface ActorResolver {
  resolveActor(sessionId: string): Promise<Actor>;
}
