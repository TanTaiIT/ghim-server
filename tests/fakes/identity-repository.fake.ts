import { randomUUID } from 'node:crypto';

import { FLAG_CLEARED_REASONS } from '../../src/modules/identity/identity.schema.js';
import type {
  Account,
  AccountFlag,
  DeviceClearance,
  DevicePost,
  DisposableDomain,
  IdVerification,
  IdentityRepository,
  OutboxEventInput,
  RevokeSessionsInput,
  Session,
  VerificationCode,
} from '../../src/modules/identity/identity.repository.js';

/** Cùng `code` với Prisma để service và test rẽ nhánh giống nhau giữa bản giả và DB thật. */
export class FakeUniqueViolation extends Error {
  readonly code = 'P2002';

  constructor(target: string) {
    super(`Unique constraint failed on ${target}`);
    this.name = 'FakeUniqueViolation';
  }
}

export interface FakeIdentityRepository extends IdentityRepository {
  readonly accounts: Map<string, Account>;
  readonly codes: Map<string, VerificationCode>;
  readonly sessions: Map<string, Session>;
  readonly devicePosts: DevicePost[];
  readonly clearances: Map<string, DeviceClearance>;
  readonly flags: Map<string, AccountFlag>;
  readonly domains: Map<string, DisposableDomain>;
  readonly verifications: Map<string, IdVerification>;
  readonly events: OutboxEventInput[];
}

/**
 * Bản giả trong bộ nhớ, cùng hình dạng với bản Prisma: giữ đúng các unique và partial unique mà
 * DB giữ (ném `P2002`), để test HTTP chạy không cần Postgres mà vẫn vấp đúng chốt. CHECK thì
 * không mô phỏng — thứ đó `identity.db.test.ts` kiểm trên DB thật.
 */
const byId = <T>(map: Map<string, T>, id: string): T => {
  const row = map.get(id);
  if (!row) throw new Error(`Không có dòng ${id}`);
  return row;
};

const assertUnique = (target: string, taken: boolean): void => {
  if (taken) throw new FakeUniqueViolation(target);
};

export function createFakeIdentityRepository(): FakeIdentityRepository {
  const accounts = new Map<string, Account>();
  const codes = new Map<string, VerificationCode>();
  const sessions = new Map<string, Session>();
  const devicePosts: DevicePost[] = [];
  const clearances = new Map<string, DeviceClearance>();
  const flags = new Map<string, AccountFlag>();
  const domains = new Map<string, DisposableDomain>();
  const verifications = new Map<string, IdVerification>();
  const events: OutboxEventInput[] = [];

  const revokeSessions = ({ accountId, reason, at, exceptId }: RevokeSessionsInput): number => {
    let count = 0;
    for (const session of sessions.values()) {
      if (session.accountId !== accountId || session.revokedAt || session.id === exceptId) continue;
      sessions.set(session.id, { ...session, revokedAt: at, revokeReason: reason });
      count += 1;
    }
    return count;
  };

  const assertAccountUniques = (
    candidate: Pick<Account, 'emailNormalized' | 'googleSub'>,
    selfId?: string,
  ) => {
    for (const other of accounts.values()) {
      if (other.id === selfId) continue;
      assertUnique(
        'accounts.email_normalized',
        other.emailNormalized === candidate.emailNormalized,
      );
      assertUnique(
        'accounts.google_sub',
        candidate.googleSub !== null && other.googleSub === candidate.googleSub,
      );
    }
  };

  const updateAccount = (id: string, patch: Partial<Account>): Account => {
    const next = { ...byId(accounts, id), ...patch, updatedAt: new Date() };
    assertAccountUniques(next, id);
    accounts.set(id, next);
    return next;
  };

  return {
    accounts,
    codes,
    sessions,
    devicePosts,
    clearances,
    flags,
    domains,
    verifications,
    events,

    findAccountById: async (id) => accounts.get(id) ?? null,
    findAccountByEmail: async (emailNormalized) =>
      [...accounts.values()].find((row) => row.emailNormalized === emailNormalized) ?? null,
    findAccountByGoogleSub: async (googleSub) =>
      [...accounts.values()].find((row) => row.googleSub === googleSub) ?? null,
    async createAccount({ at, ...data }) {
      assertAccountUniques(data);
      const row: Account = {
        id: randomUUID(),
        ...data,
        role: 'user',
        avatarUrl: null,
        phone: null,
        totpSecretEnc: null,
        totpEnabledAt: null,
        lockedReason: null,
        lockedAt: null,
        lockedBy: null,
        deletedAt: null,
        emailChangedAt: null,
        passwordChangedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      accounts.set(row.id, row);
      return row;
    },
    updateAccount: async (id, patch) => updateAccount(id, patch),
    async deleteUnverifiedAccountsBefore(createdBefore) {
      let count = 0;
      for (const row of accounts.values()) {
        if (row.status !== 'pending_verification' || row.createdAt >= createdBefore) continue;
        accounts.delete(row.id);
        for (const [id, code] of codes) if (code.accountId === row.id) codes.delete(id);
        for (const [id, session] of sessions) if (session.accountId === row.id) sessions.delete(id);
        count += 1;
      }
      return count;
    },
    async purgeAccount(id) {
      byId(accounts, id);
      accounts.delete(id);
      for (const [codeId, code] of codes) if (code.accountId === id) codes.delete(codeId);
      for (const [sessionId, session] of sessions) {
        if (session.accountId === id) sessions.delete(sessionId);
      }
    },
    async lockAccount({ accountId, reason, lockedBy, at, events: batch }) {
      updateAccount(accountId, { status: 'locked', lockedAt: at, lockedReason: reason, lockedBy });
      revokeSessions({ accountId, reason: 'account_locked', at });
      events.push(...batch);
    },
    async unlockAccount({ accountId, unlockedBy, at, events: batch }) {
      updateAccount(accountId, {
        status: 'active',
        lockedAt: null,
        lockedReason: null,
        lockedBy: null,
      });
      for (const flag of flags.values()) {
        if (flag.kind !== 'device_of_locked_account' || flag.relatedAccountId !== accountId)
          continue;
        if (flag.clearedAt) continue;
        flags.set(flag.id, {
          ...flag,
          clearedAt: at,
          clearedBy: unlockedBy,
          clearedReason: FLAG_CLEARED_REASONS.unlocked,
        });
      }
      events.push(...batch);
    },
    async softDeleteAccount({ accountId, at, events: batch }) {
      updateAccount(accountId, { status: 'deleted', deletedAt: at });
      revokeSessions({ accountId, reason: 'account_deleted', at });
      events.push(...batch);
    },

    findLiveCode: async (accountId, purpose) =>
      [...codes.values()].find(
        (row) => row.accountId === accountId && row.purpose === purpose && row.consumedAt === null,
      ) ?? null,
    async issueCode({ at, ...data }) {
      for (const code of codes.values()) {
        if (
          code.accountId === data.accountId &&
          code.purpose === data.purpose &&
          !code.consumedAt
        ) {
          codes.set(code.id, { ...code, consumedAt: at });
        }
      }
      const row: VerificationCode = {
        id: randomUUID(),
        ...data,
        attempts: 0,
        consumedAt: null,
        createdAt: at,
      };
      codes.set(row.id, row);
      return row;
    },
    async updateCode(id, patch) {
      const next = { ...byId(codes, id), ...patch };
      if (next.consumedAt === null) {
        assertUnique(
          'verification_codes_live_key',
          [...codes.values()].some(
            (row) =>
              row.id !== id &&
              row.accountId === next.accountId &&
              row.purpose === next.purpose &&
              row.consumedAt === null,
          ),
        );
      }
      codes.set(id, next);
      return next;
    },
    async applyAccountChange({
      accountId,
      patch,
      consumeCodeId,
      revokeSessions: revoke,
      at,
      events: batch,
    }) {
      if (consumeCodeId)
        codes.set(consumeCodeId, { ...byId(codes, consumeCodeId), consumedAt: at });
      updateAccount(accountId, patch);
      if (revoke) revokeSessions({ ...revoke, accountId, at });
      events.push(...batch);
    },
    async deleteCodesExpiredBefore(before) {
      let count = 0;
      for (const [id, code] of codes) {
        if (code.expiresAt < before || (code.consumedAt !== null && code.consumedAt < before)) {
          codes.delete(id);
          count += 1;
        }
      }
      return count;
    },

    async createSession({ at, ...data }) {
      assertUnique(
        'sessions.refresh_token_hash',
        [...sessions.values()].some((row) => row.refreshTokenHash === data.refreshTokenHash),
      );
      const row: Session = {
        id: randomUUID(),
        ...data,
        prevRefreshTokenHash: null,
        createdAt: at,
        lastActiveAt: at,
        revokedAt: null,
        revokeReason: null,
      };
      sessions.set(row.id, row);
      return row;
    },
    findSessionById: async (id) => sessions.get(id) ?? null,
    findSessionByRefreshHash: async (refreshTokenHash) =>
      [...sessions.values()].find((row) => row.refreshTokenHash === refreshTokenHash) ?? null,
    findSessionByPreviousRefreshHash: async (prevRefreshTokenHash) =>
      [...sessions.values()].find((row) => row.prevRefreshTokenHash === prevRefreshTokenHash) ??
      null,
    async updateSession(id, patch) {
      const next = { ...byId(sessions, id), ...patch };
      assertUnique(
        'sessions.refresh_token_hash',
        [...sessions.values()].some(
          (row) => row.id !== id && row.refreshTokenHash === next.refreshTokenHash,
        ),
      );
      sessions.set(id, next);
      return next;
    },
    listActiveSessions: async (accountId) =>
      [...sessions.values()]
        .filter((row) => row.accountId === accountId && row.revokedAt === null)
        .toSorted((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime()),
    revokeSessions: async (input) => revokeSessions(input),
    async deleteSessionsInactiveBefore(before) {
      let count = 0;
      for (const [id, row] of sessions) {
        if ((row.revokedAt !== null && row.revokedAt < before) || row.expiresAt < before) {
          sessions.delete(id);
          count += 1;
        }
      }
      return count;
    },

    findDevicePosts: async (deviceHash) =>
      devicePosts.filter((row) => row.deviceHash === deviceHash),
    async upsertDevicePost({ deviceHash, accountId, at }) {
      const existing = devicePosts.find(
        (row) => row.deviceHash === deviceHash && row.accountId === accountId,
      );
      if (existing) {
        existing.lastPostedAt = at;
        return existing;
      }
      const row: DevicePost = { deviceHash, accountId, firstPostedAt: at, lastPostedAt: at };
      devicePosts.push(row);
      return row;
    },
    findLockedAccountsOnDevice: async (deviceHash) =>
      devicePosts
        .filter((row) => row.deviceHash === deviceHash)
        .flatMap((row) => {
          const account = accounts.get(row.accountId);
          return account?.status === 'locked' && account.lockedAt
            ? [{ accountId: row.accountId, lockedAt: account.lockedAt }]
            : [];
        }),
    findDeviceClearances: async (deviceHash) =>
      [...clearances.values()].filter((row) => row.deviceHash === deviceHash),
    async createDeviceClearance({ at, ...data }) {
      assertUnique(
        'device_clearances.device_hash_account_id',
        [...clearances.values()].some(
          (row) => row.deviceHash === data.deviceHash && row.accountId === data.accountId,
        ),
      );
      const row: DeviceClearance = { id: randomUUID(), ...data, clearedAt: at };
      clearances.set(row.id, row);
      return row;
    },
    findOpenFlags: async (accountId) =>
      [...flags.values()].filter((row) => row.accountId === accountId && row.clearedAt === null),
    findFlagByLookupCode: async (lookupCode) =>
      [...flags.values()].find((row) => row.lookupCode === lookupCode) ?? null,
    async applyFlagChanges({ create, clear, at, events: batch }) {
      for (const flag of create) {
        assertUnique(
          'account_flags.lookup_code',
          [...flags.values()].some((row) => row.lookupCode === flag.lookupCode),
        );
        assertUnique(
          'account_flags_open_key',
          [...flags.values()].some(
            (row) =>
              row.accountId === flag.accountId &&
              row.kind === flag.kind &&
              row.deviceHash === flag.deviceHash &&
              row.clearedAt === null,
          ),
        );
        const row: AccountFlag = {
          id: randomUUID(),
          ...flag,
          createdAt: at,
          clearedAt: null,
          clearedBy: null,
          clearedReason: null,
        };
        flags.set(row.id, row);
      }
      for (const id of clear.ids) {
        const flag = byId(flags, id);
        if (flag.clearedAt) continue;
        flags.set(id, {
          ...flag,
          clearedAt: at,
          clearedBy: clear.clearedBy,
          clearedReason: clear.clearedReason,
        });
      }
      events.push(...batch);
    },

    findBlockedDomains: async (list) =>
      list.filter((domain) => {
        const row = domains.get(domain);
        return row !== undefined && row.removedAt === null;
      }),
    async listDisposableDomains({ skip, take }) {
      const all = [...domains.values()].toSorted((a, b) => a.domain.localeCompare(b.domain));
      return { items: all.slice(skip, skip + take), total: all.length };
    },
    async addManualDomain({ domain, at }) {
      const existing = domains.get(domain);
      const row: DisposableDomain = existing
        ? { ...existing, source: 'manual', removedAt: null, removedBy: null }
        : { domain, source: 'manual', addedAt: at, removedAt: null, removedBy: null };
      domains.set(domain, row);
      return row;
    },
    async removeDisposableDomain({ domain, removedBy, at }) {
      const existing = domains.get(domain);
      if (!existing || existing.removedAt !== null) return null;
      const row = { ...existing, removedAt: at, removedBy };
      domains.set(domain, row);
      return row;
    },
    async seedDisposableDomains(list, at) {
      let count = 0;
      for (const domain of list) {
        if (domains.has(domain)) continue;
        domains.set(domain, {
          domain,
          source: 'seed',
          addedAt: at,
          removedAt: null,
          removedBy: null,
        });
        count += 1;
      }
      return count;
    },
    countDisposableDomains: async () => domains.size,

    async createIdVerification({ at, ...data }) {
      assertUnique(
        'id_verifications_pending_key',
        [...verifications.values()].some(
          (row) => row.accountId === data.accountId && row.status === 'pending',
        ),
      );
      const row: IdVerification = {
        id: randomUUID(),
        ...data,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reason: null,
        createdAt: at,
      };
      verifications.set(row.id, row);
      return row;
    },
    findIdVerificationById: async (id) => verifications.get(id) ?? null,
    findPendingIdVerification: async (accountId) =>
      [...verifications.values()].find(
        (row) => row.accountId === accountId && row.status === 'pending',
      ) ?? null,
    async listIdVerifications({ status, skip, take }) {
      const all = [...verifications.values()]
        .filter((row) => status === undefined || row.status === status)
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return { items: all.slice(skip, skip + take), total: all.length };
    },
    async updateIdVerification(id, patch) {
      const next = { ...byId(verifications, id), ...patch };
      verifications.set(id, next);
      return next;
    },
  };
}
