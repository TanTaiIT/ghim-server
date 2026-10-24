import { readFileSync } from 'node:fs';
import { auditActor } from '../../../common/audit/audit.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { toPage, toSkipTake } from '../../../common/schemas/pagination.js';
import { hashEmail, maskEmail, normalizeEmail } from '../calc/email.calc.js';
import { parseDomainList } from '../identity.jobs.js';
import type { OutboxEventInput } from '../identity.repository.js';
import { FLAG_CLEARED_REASONS } from '../identity.schema.js';
import { hashPassword } from '../calc/password.calc.js';
import { pseudonymOf } from '../calc/pseudonym.calc.js';
import {
  hashDeviceId,
  requiredDeviceFlags,
  sharesDeviceWithLocked,
  sharesDeviceWithStruck,
  type StruckAccountRow,
  withSubmission,
} from '../calc/device.calc.js';
import { generateLookupCode, normalizeLookupCode } from '../../../common/crypto/lookup-code.js';
import {
  type IdentityService,
  type IdentityServiceDeps,
  SCREENED_DISPLAY_NAME,
} from '../identity.service.js';
import {
  avatarUrlOf,
  toDisposableDomainDto,
  toFlagDto,
  toIdVerificationDto,
  oneFlagPerKind,
  emailTaken,
  hiddenNames,
  type IdentityShared,
} from '../identity.shared.js';

export type IdentityOpsService = Pick<
  IdentityService,
  | 'lockAccount'
  | 'lockFromReport'
  | 'lockFromStrike'
  | 'unlockFromStrike'
  | 'clearStruckFlags'
  | 'emailHashIncludingDeleted'
  | 'requestLockedAppealCode'
  | 'consumeLockedAppealCode'
  | 'unlockAccount'
  | 'recordListingSubmission'
  | 'deviceFlagsFor'
  | 'sharedDeviceAccounts'
  | 'masterIds'
  | 'deviceToken'
  | 'getFlag'
  | 'openFlagsOf'
  | 'clearFlag'
  | 'listIdVerifications'
  | 'decideIdVerification'
  | 'listDisposableDomains'
  | 'addDisposableDomain'
  | 'removeDisposableDomain'
  | 'seedDisposableDomainsIfEmpty'
  | 'accountState'
  | 'lockAccountStatus'
  | 'accountSummaries'
  | 'avatarUrls'
  | 'recordSeen'
  | 'activityOf'
  | 'accountIdByEmail'
  | 'emailHashOf'
  | 'emailHintOf'
  | 'accountIdsByEmailHashes'
  | 'accountEmailHash'
  | 'createMaster'
  | 'purgeDue'
  | 'purgeDeletedAccount'
  | 'purgeDeviceData'
  | 'newAccountsByDay'
  | 'pseudonymOf'
>;

/**
 * Mặt bàn vận hành và module khác: khoá / mở khoá, đánh dấu thiết bị, duyệt giấy tờ, miền dùng một
 * lần, cửa đọc cho `platform`, và việc chỉ CLI gọi (tạo master).
 */
export function createIdentityOpsService(
  deps: IdentityServiceDeps,
  shared: IdentityShared,
): IdentityOpsService {
  const { repository, config, clock, hashKey } = deps;
  const { passwordIssue, claimEmail, assertResendAllowed, issueAndSendCode, matchLiveCode } =
    shared;

  /** Gậy đang hiệu lực của các tài khoản trên một máy — `trust` nối muộn; chưa nối thì không ai có gậy. */
  const struckOn = async (accountIds: string[]): Promise<StruckAccountRow[]> => {
    const active = (await deps.strikes?.activeStrikesOf([...new Set(accountIds)])) ?? new Map();
    return [...active].flatMap(([accountId, rows]) =>
      rows.map((row: { strikeId: string; issuedAt: Date }) => ({
        accountId,
        strikeId: row.strikeId,
        issuedAt: row.issuedAt,
      })),
    );
  };

  return {
    // ── KHOÁ / MỞ KHOÁ / XOÁ ────────────────────────────────────────────────────────────────────

    async lockAccount(actor, accountId, reason) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status === 'locked') throw new ConflictError('Tài khoản đang bị khoá rồi');
      // Chỉ master khoá được, nên đây là master tự khoá mình — hệ thống mất master, không ai mở lại được (TK 5).
      if (target.role === 'master') throw new ConflictError('Không khoá được tài khoản master');
      const locked = await repository.lockAccount({
        accountId,
        reason,
        lockedBy: actor.accountId,
        at: clock(),
        events: [
          {
            type: 'identity.account.locked',
            payload: { accountId, reason, lockedBy: actor.accountId },
          },
        ],
        audit: {
          ...auditActor(actor),
          action: 'identity.account.lock',
          targetType: 'account',
          targetId: accountId,
          reason,
        },
      });
      if (!locked) throw new ConflictError('Tài khoản đang bị khoá rồi');
      deps.sessionsRevoked?.account(accountId);
    },

    async lockFromReport({ accountId, by, reason }) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted' || target.status === 'locked') return;
      if (target.role === 'master') return;
      const locked = await repository.lockAccount({
        accountId,
        reason,
        lockedBy: by,
        at: clock(),
        events: [{ type: 'identity.account.locked', payload: { accountId, reason, lockedBy: by } }],
        audit: {
          actorId: by,
          actorRole: 'master',
          action: 'identity.account.lock',
          targetType: 'account',
          targetId: accountId,
          reason,
          details: { cause: 'report' },
        },
      });
      if (locked) deps.sessionsRevoked?.account(accountId);
    },

    async lockFromStrike({ accountId, by, reason, strikeId }) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted' || target.status === 'locked') return;
      if (target.role === 'master') return;
      const locked = await repository.lockAccount({
        accountId,
        reason,
        lockedBy: by,
        at: clock(),
        events: [{ type: 'identity.account.locked', payload: { accountId, reason, lockedBy: by } }],
        audit: {
          actorId: by,
          actorRole: 'master',
          action: 'identity.account.lock',
          targetType: 'account',
          targetId: accountId,
          reason,
          details: { cause: 'strike', strikeId },
        },
      });
      if (locked) deps.sessionsRevoked?.account(accountId);
    },

    async unlockFromStrike({ accountId, by }) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status !== 'locked') return;
      await repository.unlockAccount({
        accountId,
        unlockedBy: by,
        at: clock(),
        events: [{ type: 'identity.account.unlocked', payload: { accountId, unlockedBy: by } }],
        audit: {
          actorId: by,
          actorRole: 'master',
          action: 'identity.account.unlock',
          targetType: 'account',
          targetId: accountId,
          details: { cause: 'strike' },
        },
      });
    },

    clearStruckFlags: (strikeId) =>
      repository.clearFlagsByStrike(strikeId, clock(), FLAG_CLEARED_REASONS.strikeEnded),

    async emailHashIncludingDeleted(accountId) {
      return (await repository.findAccountById(accountId))?.emailHash ?? null;
    },

    async requestLockedAppealCode(accountId) {
      const account = await repository.findAccountById(accountId);
      if (!account || account.status === 'deleted') return;
      const now = clock();
      await assertResendAllowed(account.id, 'locked_appeal', now);
      await issueAndSendCode(account, 'locked_appeal', account.email, now);
    },

    async consumeLockedAppealCode(accountId, code) {
      const now = clock();
      try {
        const live = await matchLiveCode(accountId, 'locked_appeal', code, now);
        await repository.updateCode(live.id, { consumedAt: now });
        return true;
      } catch {
        return false;
      }
    },

    async unlockAccount(actor, accountId) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status !== 'locked') throw new ConflictError('Tài khoản không bị khoá');
      // Khoá vì gậy nghiêm trọng chỉ mở bằng quyết định về gậy đó (chốt 17/10/2026).
      if (await deps.strikes?.seriousLockOf(accountId)) {
        throw new ConflictError(
          'Tài khoản đang khoá vì vi phạm nghiêm trọng — quyết vi phạm đó mới mở khoá được',
          'LOCKED_BY_STRIKE',
        );
      }
      const unlocked = await repository.unlockAccount({
        accountId,
        unlockedBy: actor.accountId,
        at: clock(),
        events: [
          {
            type: 'identity.account.unlocked',
            payload: { accountId, unlockedBy: actor.accountId },
          },
        ],
        audit: {
          ...auditActor(actor),
          action: 'identity.account.unlock',
          targetType: 'account',
          targetId: accountId,
        },
      });
      if (!unlocked) throw new ConflictError('Tài khoản không bị khoá');
    },

    // ── DẤU THIẾT BỊ ────────────────────────────────────────────────────────────────────────────

    deviceToken: (deviceId) => hashDeviceId(deviceId, hashKey),

    // Mốc là lúc gửi tin, không lúc bên nghe chạy: chỗ trên máy xếp theo lần đăng đầu, và outbox có thể trễ.
    async recordListingSubmission(accountId, deviceHash, now) {
      await repository.upsertDevicePost({ deviceHash, accountId, at: now });

      const [posts, lockedAccounts, clearances, open] = await Promise.all([
        repository.findDevicePosts(deviceHash),
        repository.findLockedAccountsOnDevice(deviceHash),
        repository.findDeviceClearances(deviceHash),
        repository.findOpenFlags(accountId),
      ]);
      const required = oneFlagPerKind(
        requiredDeviceFlags({
          accountId,
          now,
          windowDays: config.get('identity.deviceWindowDays'),
          slots: config.get('identity.deviceSlots'),
          posts,
          lockedAccounts,
          struckAccounts: await struckOn(posts.map((post) => post.accountId)),
          clearances,
        }),
      );
      const openHere = open.filter((flag) => flag.deviceHash === deviceHash);
      const create = required
        .filter((flag) => !openHere.some((existing) => existing.kind === flag.kind))
        .map((flag) => ({
          accountId,
          kind: flag.kind,
          deviceHash,
          relatedAccountId: flag.relatedAccountId,
          relatedStrikeId: flag.relatedStrikeId,
          lookupCode: generateLookupCode(),
        }));
      const toClear = openHere.filter((flag) => !required.some((item) => item.kind === flag.kind));
      if (create.length === 0 && toClear.length === 0) return;

      const events: OutboxEventInput[] = [
        ...create.map((flag) => ({
          type: 'identity.device.flagged' as const,
          payload: { accountId, kind: flag.kind, lookupCode: flag.lookupCode },
        })),
        ...toClear.map((flag) => ({
          type: 'identity.device.flag_cleared' as const,
          payload: { accountId, kind: flag.kind },
        })),
      ];
      await repository.applyFlagChanges({
        create,
        clear: {
          ids: toClear.map((flag) => flag.id),
          clearedBy: null,
          clearedReason: FLAG_CLEARED_REASONS.recomputed,
        },
        at: now,
        events,
        audit: null,
      });
    },

    sharedDeviceAccounts: (accountId, since) => repository.accountsSharingDevice(accountId, since),

    masterIds: () => repository.activeMasterIds(),

    async deviceFlagsFor(accountId, deviceHash, at) {
      const [posts, lockedAccounts, clearances, open] = await Promise.all([
        repository.findDevicePosts(deviceHash),
        repository.findLockedAccountsOnDevice(deviceHash),
        repository.findDeviceClearances(deviceHash),
        repository.findOpenFlags(accountId),
      ]);
      const windowDays = config.get('identity.deviceWindowDays');
      const struckAccounts = await struckOn(posts.map((post) => post.accountId));
      const required = requiredDeviceFlags({
        accountId,
        now: at,
        windowDays,
        slots: config.get('identity.deviceSlots'),
        posts: withSubmission(posts, accountId, at),
        lockedAccounts,
        struckAccounts,
        clearances,
      });
      // Máy này: lượt tính lại sau lượt gửi sẽ ra đúng tập vừa tính. Máy khác: đánh dấu còn mở tới khi hỗ trợ gỡ.
      const elsewhere = open.filter((flag) => flag.deviceHash !== deviceHash);
      return {
        kinds: [...new Set([...required, ...elsewhere].map((flag) => flag.kind))],
        sharedWithLocked: sharesDeviceWithLocked({
          accountId,
          now: at,
          windowDays,
          posts,
          lockedAccounts,
          clearances,
        }),
        sharedWithStruck: sharesDeviceWithStruck({
          accountId,
          now: at,
          windowDays,
          posts,
          struckAccounts,
        }),
      };
    },

    async openFlagsOf(accountId) {
      return (await repository.findOpenFlags(accountId)).map(toFlagDto);
    },

    async getFlag(lookupCode) {
      const flag = await repository.findFlagByLookupCode(normalizeLookupCode(lookupCode));
      if (!flag) throw new NotFoundError('Không có mã tra cứu này');
      return toFlagDto(flag);
    },

    async clearFlag(actor, lookupCode, reason) {
      const now = clock();
      const flag = await repository.findFlagByLookupCode(normalizeLookupCode(lookupCode));
      if (!flag) throw new NotFoundError('Không có mã tra cứu này');
      if (flag.clearedAt) throw new ConflictError('Đánh dấu này đã được gỡ');
      // Không ai, trừ master, tự xử việc của mình (TK 4; fix-audit-identity-low, L2).
      if (flag.accountId === actor.accountId && actor.role !== 'master') {
        throw new ForbiddenError('Không gỡ được đánh dấu trên tài khoản của chính mình');
      }

      // Miễn trừ gắn với (máy, tài khoản): lượt gửi tin sau không bị đánh dấu lại vì chủ cũ của máy.
      const clearances = await repository.findDeviceClearances(flag.deviceHash);
      if (!clearances.some((row) => row.accountId === flag.accountId)) {
        await repository.createDeviceClearance({
          deviceHash: flag.deviceHash,
          accountId: flag.accountId,
          clearedBy: actor.accountId,
          reason,
          at: now,
        });
      }
      await repository.applyFlagChanges({
        create: [],
        clear: { ids: [flag.id], clearedBy: actor.accountId, clearedReason: reason },
        at: now,
        events: [
          {
            type: 'identity.device.flag_cleared',
            payload: { accountId: flag.accountId, kind: flag.kind },
          },
        ],
        // Nhật ký nhắc tài khoản được gỡ, không nhắc mã thiết bị (spec device-registry).
        audit: {
          ...auditActor(actor),
          action: 'identity.flag.clear',
          targetType: 'account',
          targetId: flag.accountId,
          reason,
          details: { lookupCode: flag.lookupCode, kind: flag.kind },
        },
      });
    },

    // ── XÁC MINH GIẤY TỜ ────────────────────────────────────────────────────────────────────────

    async listIdVerifications({ status, ...page }) {
      const { items, total } = await repository.listIdVerifications({
        ...toSkipTake(page),
        ...(status === undefined ? {} : { status }),
      });
      return toPage(items.map(toIdVerificationDto), total, page);
    },

    async decideIdVerification(actor, id, { status, reason }) {
      const row = await repository.findIdVerificationById(id);
      if (!row) throw new NotFoundError('Không có hồ sơ này');
      if (row.status !== 'pending') throw new ConflictError('Hồ sơ này đã được duyệt');
      // Không ai, trừ master, tự xử việc của mình (TK 4; fix-audit-identity-low, L2).
      if (row.accountId === actor.accountId && actor.role !== 'master') {
        throw new ForbiddenError('Không duyệt được hồ sơ giấy tờ của chính mình');
      }
      const decided = await repository.decidePendingIdVerification(
        id,
        { status, reviewedBy: actor.accountId, reviewedAt: clock(), reason: reason ?? null },
        {
          ...auditActor(actor),
          action: 'identity.id_verification.decide',
          targetType: 'id_verification',
          targetId: id,
          reason: reason ?? null,
          details: { status },
        },
      );
      if (!decided) throw new ConflictError('Hồ sơ này đã được duyệt');
      return toIdVerificationDto(decided);
    },

    // ── MIỀN DÙNG MỘT LẦN ───────────────────────────────────────────────────────────────────────

    async listDisposableDomains(query) {
      const { items, total } = await repository.listDisposableDomains(toSkipTake(query));
      return toPage(items.map(toDisposableDomainDto), total, query);
    },

    async addDisposableDomain(actor, domain) {
      const row = await repository.addManualDomain({
        domain,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'identity.disposable_domain.add',
          targetType: 'disposable_domain',
          targetId: domain,
        },
      });
      return toDisposableDomainDto(row);
    },

    async removeDisposableDomain(actor, domain) {
      const row = await repository.removeDisposableDomain({
        domain,
        removedBy: actor.accountId,
        at: clock(),
        audit: {
          ...auditActor(actor),
          action: 'identity.disposable_domain.remove',
          targetType: 'disposable_domain',
          targetId: domain,
        },
      });
      if (!row) throw new NotFoundError('Miền này không có trong danh sách đang chặn');
    },

    async seedDisposableDomainsIfEmpty() {
      if ((await repository.countDisposableDomains()) > 0) return 0;
      const seed = parseDomainList(
        readFileSync(new URL('../data/disposable-domains.seed.txt', import.meta.url), 'utf8'),
      );
      return repository.seedDisposableDomains(seed, clock());
    },

    // ── CHO MODULE KHÁC VÀ CLI ──────────────────────────────────────────────────────────────────

    async accountState(accountId) {
      const account = await repository.findAccountById(accountId);
      return account ? { role: account.role, status: account.status } : null;
    },

    lockAccountStatus: (tx, accountId) => repository.lockAccountStatus(tx, accountId),

    async accountSummaries(ids) {
      const rows = await repository.findAccountSummaries([...new Set(ids)]);
      const hidden = await hiddenNames(
        deps,
        rows.map((row) => row.displayName),
      );
      return new Map(
        rows.map((row) => [
          row.id,
          hidden.has(row.displayName) ? { ...row, displayName: SCREENED_DISPLAY_NAME } : row,
        ]),
      );
    },

    async avatarUrls(ids) {
      const rows = await repository.findAvatarSources([...new Set(ids)]);
      const urls = await Promise.all(
        rows.map(async (row) => [row.id, await avatarUrlOf(row, deps.images)] as const),
      );
      return new Map(urls.flatMap(([id, url]) => (url ? [[id, url] as const] : [])));
    },

    recordSeen: (accountId) => repository.recordSeen(accountId, clock()),

    async activityOf(ids) {
      const rows = await repository.findActivity([...new Set(ids)]);
      return new Map(
        rows.map((row) => [row.id, { showActivity: row.showActivity, lastSeenAt: row.lastSeenAt }]),
      );
    },

    async accountIdByEmail(email) {
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      return account && account.status !== 'deleted' ? account.id : null;
    },

    emailHashOf: (email) => hashEmail(normalizeEmail(email), hashKey),

    emailHintOf: (email) => maskEmail(email.trim()),

    async accountEmailHash(accountId) {
      const account = await repository.findAccountById(accountId);
      return account && account.status !== 'deleted' ? account.emailHash : null;
    },

    async accountIdsByEmailHashes(hashes) {
      const rows = await repository.findAccountIdsByEmailHashes([...new Set(hashes)]);
      return new Map(rows.map((row) => [row.emailHash, row.id]));
    },

    async createMaster({ email, password, displayName }) {
      const now = clock();
      const weak = passwordIssue(password);
      if (weak) throw weak;
      if (await repository.findMaster()) {
        throw new ConflictError('Hệ thống đã có master — chỉ một, không thay', 'MASTER_EXISTS');
      }
      const emailNormalized = normalizeEmail(email);
      if (await claimEmail(emailNormalized, now)) throw emailTaken();

      // Tạo rồi nâng vai, không tạo thẳng master: `createAccount` là cửa của đăng ký và cố ý
      // không nhận `role` — mọi đường tạo tài khoản khác đều ra người dùng thường.
      const account = await repository.createAccount({
        email: email.trim(),
        emailNormalized,
        emailHash: hashEmail(emailNormalized, hashKey),
        passwordHash: await hashPassword(password),
        googleSub: null,
        status: 'active',
        displayName: displayName.trim(),
        at: now,
      });
      await repository.updateAccount(account.id, { role: 'master' });
      return { accountId: account.id };
    },

    // ── HẠN LƯU (add-data-retention) ──────────────────────────────────────────────────────────

    purgeDue: (deletedBefore, after, limit) =>
      repository.deletedAccountsDue(deletedBefore, after, limit),

    async purgeDeletedAccount(accountId) {
      const now = clock();
      // Đã ẩn danh từ lượt đăng ký lại cùng email thì `false` — vẫn ghi đã dọn.
      await repository.anonymizeDeletedAccount({ id: accountId, deletedBefore: now });
      await repository.markAccountPurged(accountId, now);
    },

    purgeDeviceData: (before) => repository.purgeDeviceData(before),
    newAccountsByDay: (from, to) => repository.newAccountsByDay(from, to),

    pseudonymOf: (accountId) => pseudonymOf(accountId, hashKey),
  };
}
