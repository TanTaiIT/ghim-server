/** Tuple của enum `account_role` trong schema.prisma — nằm ở `common/auth` vì guard của mọi module đọc nó. */
export const ACCOUNT_ROLES = ['user', 'master'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Người đang gọi, gắn vào `request.actor` sau `authenticate`. Chỉ mang thứ guard cần — không email, không dấu băm. */
export interface Actor {
  accountId: string;
  role: AccountRole;
  sessionId: string;
  emailVerified: boolean;
}

/**
 * `request.actor` sau `authenticate`. Thiếu là lỗi lập trình — route khai guard mà quên
 * `authenticate` đứng trước — không phải lỗi người dùng, nên ném `Error` thường (500).
 */
export function actorOf(request: { actor: Actor | null }): Actor {
  if (!request.actor) throw new Error('Route này phải có authenticate đứng trước trong preHandler');
  return request.actor;
}

/** "Người này là ai" — `identity` trả lời, mọi module hỏi qua đây (CLAUDE.md luật 12). */
export interface ActorResolver {
  resolveActor(sessionId: string): Promise<Actor>;
}
