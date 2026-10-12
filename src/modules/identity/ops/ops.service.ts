import { readFileSync } from 'node:fs';
import { auditActor } from '../../../common/audit/audit.js';
import { ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import { toPage, toSkipTake } from '../../../common/schemas/pagination.js';
import { hashEmail, normalizeEmail } from '../email.calc.js';
import { parseDomainList } from '../identity.jobs.js';
import type { OutboxEventInput } from '../identity.repository.js';
import { FLAG_CLEARED_REASONS } from '../identity.schema.js';
import { hashPassword } from '../password.calc.js';
import { hashDeviceId, requiredDeviceFlags } from '../device.calc.js';
import { generateLookupCode, normalizeLookupCode } from './lookup-code.calc.js';
import type { IdentityService, IdentityServiceDeps } from '../identity.service.js';
import {
  toDisposableDomainDto,
  toFlagDto,
  toIdVerificationDto,
  oneFlagPerKind,
  emailTaken,
  type IdentityShared,
} from '../identity.shared.js';

export type IdentityOpsService = Pick<
  IdentityService,
  | 'lockAccount'
  | 'unlockAccount'
  | 'recordListingSubmission'
  | 'deviceToken'
  | 'getFlag'
  | 'clearFlag'
  | 'listIdVerifications'
  | 'decideIdVerification'
  | 'listDisposableDomains'
  | 'addDisposableDomain'
  | 'removeDisposableDomain'
  | 'seedDisposableDomainsIfEmpty'
  | 'accountState'
  | 'accountSummaries'
  | 'accountIdByEmail'
  | 'emailHashOf'
  | 'accountIdsByEmailHashes'
  | 'accountEmailHash'
  | 'createMaster'
  | 'resetTwoFactor'
>;

/**
 * Mặt bàn vận hành và module khác: khoá / mở khoá, đánh dấu thiết bị, duyệt giấy tờ, miền dùng một
 * lần, cửa đọc cho `platform`, và hai việc chỉ CLI gọi (tạo master, đặt lại hai lớp).
 */
export function createIdentityOpsService(
  deps: IdentityServiceDeps,
  shared: IdentityShared,
): IdentityOpsService {
  const { repository, config, clock, hashKey } = deps;
  const { passwordIssue, claimEmail } = shared;

  return {
    // ── KHOÁ / MỞ KHOÁ / XOÁ ────────────────────────────────────────────────────────────────────

    async lockAccount(actor, accountId, reason) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status === 'locked') throw new ConflictError('Tài khoản đang bị khoá rồi');
      await repository.lockAccount({
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
      deps.sessionsRevoked?.account(accountId);
    },

    async unlockAccount(actor, accountId) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status !== 'locked') throw new ConflictError('Tài khoản không bị khoá');
      await repository.unlockAccount({
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
      return toIdVerificationDto(
        await repository.updateIdVerification(
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
        ),
      );
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

    async accountSummaries(ids) {
      const rows = await repository.findAccountSummaries([...new Set(ids)]);
      return new Map(rows.map((row) => [row.id, row]));
    },

    async accountIdByEmail(email) {
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      return account && account.status !== 'deleted' ? account.id : null;
    },

    emailHashOf: (email) => hashEmail(normalizeEmail(email), hashKey),

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

    async resetTwoFactor({ email }) {
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      if (!account || account.status === 'deleted')
        throw new NotFoundError('Không có tài khoản này');
      await repository.updateAccount(account.id, { totpSecretEnc: null, totpEnabledAt: null });
      // Phiên cũ có thể đã qua lớp thứ hai bằng bí mật vừa gỡ: thu hết, vào lại bằng mật khẩu.
      await repository.revokeSessions({
        accountId: account.id,
        reason: 'password_reset',
        at: clock(),
      });
      deps.sessionsRevoked?.account(account.id);
    },
  };
}
