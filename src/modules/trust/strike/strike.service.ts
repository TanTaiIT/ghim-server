import type { Prisma, ReviewActorRole, StrikeKind, StrikeStatus } from '@prisma/client';

import type { OutboxEventInput } from '../../../common/outbox/outbox.js';

import type { Actor } from '../../../common/auth/actor.js';
import { auditActor } from '../../../common/audit/audit.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../common/errors/app-error.js';
import { sequentially } from '../../../common/utils/sequential.js';
import {
  appealOpen,
  appealUntil,
  expiresAtOf,
  inForce,
  pointsOf,
  type Standing,
  standingOf,
} from '../calc/strike.calc.js';
import { TRUST_EVENTS, trustEvent } from '../trust.outbox.js';
import { DAY_MS, strikeRules, type TrustServiceDeps } from '../trust.shared.js';
import type { RuleArticle, Strike, StrikeWithRelations } from './strike.repository.js';
import {
  type AmnestyBody,
  type CommentDto,
  type CreateRuleArticleBody,
  DEFAULT_RULE_ARTICLES,
  type RuleArticleDto,
  type SeriousAppealResultDto,
  type StrikeDetailDto,
  type StrikeDto,
  type UpdateRuleArticleBody,
} from './strike.schema.js';

type Tx = Prisma.TransactionClient;
const YEAR_MS = 365 * DAY_MS;

export interface IssueStrikeInput {
  accountId: string;
  kind: StrikeKind;
  ruleArticleId: string;
  issuedBy: string;
  issuedByRole: ReviewActorRole;
  /** Danh mục của tin — staff khác của danh mục xét khiếu nại; `null` với gậy do master ra hay từ báo cáo về người. */
  categoryId: string | null;
  fromReport: boolean;
  listingId: string | null;
  decisionId: string | null;
}

export interface SeriousLock {
  strikeId: string;
  status: 'active' | 'permanent';
  ruleText: string;
  issuedAt: Date;
}

export interface TrustStrikeService {
  /** Trong transaction quyết định của `review`: ghi gậy, phát sự kiện — chỉ `trust` ghi gậy (CLAUDE.md luật 11). */
  issueStrike(tx: Tx, input: IssueStrikeInput): Promise<Strike>;
  standingOf(accountId: string): Promise<Standing>;
  /** Điểm gậy đọc trong `tx` của lượt lên bảng — lý do hạn chế "gậy" (spec listing/visibility). */
  strikePointsIn(tx: Tx, accountId: string): Promise<number>;
  /** Điểm gậy đang hiệu lực — `listing` (lý do "gậy"), `screening` (hàng "có gậy"). */
  strikePointsOf(accountId: string): Promise<number>;
  /** Trong các tài khoản, ai đang có gậy hiệu lực — `listing` đặt lại lý do "gậy" cho tin hiện lại. */
  struckAccounts(accountIds: string[]): Promise<Set<string>>;
  hasSevereStrike(accountId: string): Promise<boolean>;
  /** Gậy đang hiệu lực của nhiều tài khoản — `identity` đánh dấu máy có gậy. */
  activeStrikesOf(
    accountIds: string[],
  ): Promise<Map<string, { strikeId: string; issuedAt: Date }[]>>;
  /** Email của tài khoản bị khoá vĩnh viễn — `identity` từ chối đăng ký (spec identity/registration). */
  isEmailBanned(emailHash: string): Promise<boolean>;
  /** Gậy nghiêm trọng đang khoá tài khoản này (chưa quyết hay vĩnh viễn); `null` = không. */
  seriousLockOf(accountId: string): Promise<SeriousLock | null>;
  /** Lịch sử gậy của một người, mới trước — bảng uy tín, màn xử việc. */
  strikesOf(accountId: string): Promise<StrikeDto[]>;
  strikeDetail(strikeId: string): Promise<StrikeDetailDto | null>;
  myStrikes(actor: Actor): Promise<StrikeDto[]>;
  fileAppeal(actor: Actor, strikeId: string, statement: string): Promise<StrikeDto>;
  /** Kênh hỗ trợ không cần đăng nhập: luôn im lặng — không lộ email nào có tài khoản hay đang bị khoá (TK 22). */
  requestSeriousAppealCode(email: string): Promise<void>;
  fileSeriousAppeal(input: {
    email: string;
    code: string;
    statement: string;
  }): Promise<SeriousAppealResultDto>;
  /** Trong transaction quyết định của `review`. `by` null = tự thắng vì quá hạn xét. */
  decideAppeal(
    tx: Tx,
    input: { strikeId: string; verdict: 'won' | 'lost'; by: string | null; at: Date },
  ): Promise<void>;
  decideSerious(
    tx: Tx,
    input: {
      strikeId: string;
      decision: 'permanent' | 'downgrade' | 'cancel';
      by: string;
      at: Date;
    },
  ): Promise<void>;
  decidePermanentReview(
    tx: Tx,
    input: { strikeId: string; decision: 'keep' | 'lift'; by: string; at: Date },
  ): Promise<void>;
  /** Master gỡ khoá vĩnh viễn ngoài kỳ xem lại (chốt 17/10/2026). */
  lift(actor: Actor, strikeId: string): Promise<StrikeDto>;
  amnesty(actor: Actor, accountId: string, body: AmnestyBody): Promise<StrikeDto[]>;
  addComment(actor: Actor, strikeId: string, body: string): Promise<CommentDto>;
  ruleArticles(input: { includeInactive: boolean }): Promise<RuleArticleDto[]>;
  /** Một điều — `review` lấy câu trích làm lý do người đăng thấy, trước khi đổi tin. */
  ruleArticle(id: string): Promise<RuleArticleDto | null>;
  createRuleArticle(actor: Actor, body: CreateRuleArticleBody): Promise<RuleArticleDto>;
  updateRuleArticle(actor: Actor, id: string, body: UpdateRuleArticleBody): Promise<RuleArticleDto>;
  /** Bước khởi động: bộ quy định khởi đầu khi bảng trống. */
  ensureRuleArticles(): Promise<{ ruleArticles: number }>;
  /** Bên nghe `identity.account.created`: kế thừa gậy đang hiệu lực mang dấu băm email này (TK 21). */
  onAccountCreated(accountId: string, emailHash: string): Promise<void>;
  /** Bên nghe `identity.account.email_changed`: gậy đang hiệu lực theo cả email mới. */
  onEmailChanged(accountId: string, emailHash: string): Promise<void>;
  /** Job mỗi giờ: gậy tới hạn → hết hiệu lực, phát sự kiện cho bên nghe (điểm đọc đã đúng từ trước). */
  expireStrikes(): Promise<number>;
  /** Job hằng ngày: khoá vĩnh viễn tới kỳ xem lại → `review` mở việc cho master. */
  permanentReviewsDue(): Promise<number>;
  // ── HẠN LƯU (add-data-retention) — `ops` gọi ──
  /** Gậy mới nhất của từng tin, dạng dữ kiện: `ops` tính tạm giữ bằng chứng và mốc xoá tin bị gỡ vì vi phạm. */
  strikesOfListings(listingIds: string[]): Promise<Map<string, StrikeFact>>;
  /** Gậy tới hạn ẩn danh hoá: đóng (hết hạn, huỷ) trước mốc, hay đã gỡ khoá và ngày khoá trước mốc. */
  anonymizeDue(closedBefore: Date, limit: number): Promise<{ id: string; accountId: string }[]>;
  /** Trong transaction của `ops` cùng `review` và nhật ký: người nhận thành mã giả, dấu băm email và lời khiếu nại bỏ. */
  anonymizeStrike(
    tx: Tx,
    input: { id: string; accountId: string; pseudonym: string },
  ): Promise<boolean>;
  dropLiftedEmailHashes(): Promise<number>;
  /** Bên nghe `identity.account.purged`: đăng ký dở bị dọn thì gậy đã kế thừa của nó đi theo. */
  onAccountsPurged(accountIds: string[]): Promise<number>;
}

/** Dữ kiện một gậy cho luật hạn lưu và tạm giữ của `ops` — không mang người, lý do hay điều đã trích. */
export interface StrikeFact {
  id: string;
  kind: StrikeKind;
  status: StrikeStatus;
  issuedAt: Date;
  expiresAt: Date | null;
  cancelledAt: Date | null;
  liftedAt: Date | null;
  appealPending: boolean;
}

const notFound = (): NotFoundError => new NotFoundError('Không có gậy này');
const windowClosed = (): ConflictError =>
  new ConflictError('Đã quá hạn khiếu nại gậy này', 'APPEAL_WINDOW_CLOSED');
const alreadyUsed = (): ConflictError =>
  new ConflictError('Gậy này đã được khiếu nại — mỗi gậy khiếu nại một lần', 'APPEAL_ALREADY_USED');

const toArticle = (row: RuleArticle): RuleArticleDto => ({
  id: row.id,
  code: row.code,
  title: row.title,
  text: row.text,
  active: row.active,
  sort: row.sort,
});

const remainingDays = (expiresAt: Date | null, now: Date): number | null =>
  expiresAt && expiresAt > now ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS) : null;

const issuedEvent = (strike: Strike, inherited: boolean) =>
  trustEvent(TRUST_EVENTS.strikeIssued, {
    strikeId: strike.id,
    accountId: strike.accountId,
    kind: strike.kind,
    points: strike.points,
    listingId: strike.listingId,
    ruleText: strike.ruleText,
    issuedBy: strike.issuedBy,
    issuedByRole: strike.issuedByRole,
    categoryId: strike.categoryId,
    fromReport: strike.fromReport,
    inherited,
  });

const lockedSerious = async (strike: StrikeWithRelations): Promise<void> => {
  if (strike.kind !== 'serious' || strike.status !== 'active') {
    throw new ConflictError('Gậy này không còn chờ quyết', 'STRIKE_NOT_PENDING');
  }
};

/**
 * Gậy, khiếu nại, ân xá, gậy nghiêm trọng (TK 21, 22; design add-strikes). Mọi lượt đổi gậy phát `strike.standing` —
 * bên nghe đối chiếu lại, không tin payload.
 */
export function createStrikeService(
  deps: TrustServiceDeps,
  onChanged: (accountId: string) => Promise<unknown>,
): TrustStrikeService {
  const { strikes, identity, listings, privileges, config, clock } = deps;
  const rules = () => strikeRules(config);

  const standingEvents = async (tx: Tx, accountId: string) => {
    const rows = await strikes.listOf(accountId, tx);
    const standing = standingOf(rows, clock(), rules());
    return trustEvent(TRUST_EVENTS.strikeStanding, {
      accountId,
      points: standing.points,
      active: standing.active,
      severe: standing.severe,
    });
  };

  const toDto = (
    strike: Strike,
    appeal: StrikeWithRelations['appeal'],
    article: RuleArticle,
  ): StrikeDto => {
    const now = clock();
    const appealWindow = strike.kind === 'serious' ? rules().seriousAppealDays : rules().appealDays;
    return {
      id: strike.id,
      kind: strike.kind,
      status: strike.status,
      points: strike.points,
      inForce: inForce(strike, now),
      ruleCode: article.code,
      ruleText: strike.ruleText,
      issuedAt: strike.issuedAt.toISOString(),
      expiresAt: strike.expiresAt?.toISOString() ?? null,
      remainingDays: remainingDays(strike.expiresAt, now),
      listingId: strike.listingId,
      cancelledAt: strike.cancelledAt?.toISOString() ?? null,
      cancelCause: strike.cancelCause,
      seriousDecision: strike.seriousDecision,
      appealable:
        strike.kind !== 'serious' &&
        inForce(strike, now) &&
        appeal === null &&
        appealOpen(strike.issuedAt, now, appealWindow),
      appealUntil: appealUntil(strike.issuedAt, appealWindow).toISOString(),
      appeal: appeal
        ? {
            status: appeal.status,
            filedAt: appeal.filedAt.toISOString(),
            decidedAt: appeal.decidedAt?.toISOString() ?? null,
          }
        : null,
    };
  };

  const listDtos = async (accountId: string): Promise<StrikeDto[]> => {
    const rows = await strikes.listOf(accountId);
    const full = await Promise.all(rows.map((row) => strikes.find(row.id)));
    return full.flatMap((row) => (row ? [toDto(row, row.appeal, row.article)] : []));
  };

  const activeArticle = async (id: string): Promise<RuleArticle> => {
    const article = await strikes.findArticle(id);
    if (!article?.active) {
      throw new BadRequestError('Chọn một điều đang dùng trong quy định sàn', 'VALIDATION_ERROR');
    }
    return article;
  };

  /** Huỷ gậy (khiếu nại thắng, ân xá, huỷ gậy nghiêm trọng): dòng ở lại với dấu huỷ, thôi tính điểm (TK 22). */
  const cancelIn = async (
    tx: Tx,
    strike: StrikeWithRelations,
    cause: 'appeal' | 'amnesty' | 'serious_cancel',
    by: string | null,
    at: Date,
  ) => {
    await strikes.update(tx, strike.id, {
      status: 'cancelled',
      cancelledAt: at,
      cancelCause: cause,
      cancelledBy: by,
    });
    const events = [
      trustEvent(TRUST_EVENTS.strikeCancelled, {
        strikeId: strike.id,
        accountId: strike.accountId,
        kind: strike.kind,
        listingId: strike.listingId,
        cause,
      }),
    ];
    // Khiếu nại đang chờ đóng theo — `review` đóng việc (spec amnesty).
    if (strike.appeal?.status === 'pending' && cause !== 'appeal') {
      await strikes.updateAppeal(tx, strike.id, { status: 'closed', decidedAt: at, decidedBy: by });
      events.push(
        trustEvent(TRUST_EVENTS.appealClosed, { appealId: strike.appeal.id, strikeId: strike.id }),
      );
    }
    return events;
  };

  /** Tài khoản có hồ sơ của kênh hỗ trợ: đang bị khoá vì gậy nghiêm trọng chưa quyết. */
  const seriousPendingOf = async (email: string) => {
    const accountId = await identity.accountIdByEmail(email);
    if (!accountId) return null;
    const strike = await strikes.seriousLockOf(accountId);
    return strike && strike.status === 'active' ? { accountId, strike } : null;
  };

  return {
    async issueStrike(tx, input) {
      const article = await activeArticle(input.ruleArticleId);
      const now = clock();
      const hashes = await identity.emailHashIncludingDeleted(input.accountId);
      await strikes.lockAccount(tx, input.accountId);
      const strike = await strikes.insert(tx, {
        accountId: input.accountId,
        kind: input.kind,
        points: pointsOf(input.kind, rules()),
        ruleArticleId: article.id,
        ruleText: article.text,
        issuedBy: input.issuedBy,
        issuedByRole: input.issuedByRole,
        categoryId: input.issuedByRole === 'master' || input.fromReport ? null : input.categoryId,
        fromReport: input.fromReport,
        listingId: input.listingId,
        decisionId: input.decisionId,
        emailHashes: hashes ? [hashes] : [],
        inheritedFromId: null,
        issuedAt: now,
        expiresAt: expiresAtOf(input.kind, now, rules()),
      });
      await strikes.emitIn(tx, [
        issuedEvent(strike, false),
        await standingEvents(tx, input.accountId),
      ]);
      return strike;
    },

    async standingOf(accountId) {
      return standingOf(await strikes.listOf(accountId), clock(), rules());
    },

    async strikePointsIn(tx, accountId) {
      return standingOf(await strikes.listOf(accountId, tx), clock(), rules()).points;
    },

    async strikePointsOf(accountId) {
      return standingOf(await strikes.listOf(accountId), clock(), rules()).points;
    },

    async struckAccounts(accountIds) {
      const now = clock();
      const rows = await strikes.activeOf(accountIds);
      return new Set(rows.filter((row) => inForce(row, now)).map((row) => row.accountId));
    },

    async hasSevereStrike(accountId) {
      return standingOf(await strikes.listOf(accountId), clock(), rules()).severe;
    },

    async activeStrikesOf(accountIds) {
      const now = clock();
      const rows = (await strikes.activeOf(accountIds)).filter((row) => inForce(row, now));
      const map = new Map<string, { strikeId: string; issuedAt: Date }[]>();
      for (const row of rows) {
        map.set(row.accountId, [
          ...(map.get(row.accountId) ?? []),
          { strikeId: row.id, issuedAt: row.issuedAt },
        ]);
      }
      return map;
    },

    isEmailBanned: (emailHash) => strikes.hasPermanentByEmailHash(emailHash),

    async seriousLockOf(accountId) {
      const strike = await strikes.seriousLockOf(accountId);
      if (!strike || (strike.status !== 'active' && strike.status !== 'permanent')) return null;
      return {
        strikeId: strike.id,
        status: strike.status,
        ruleText: strike.ruleText,
        issuedAt: strike.issuedAt,
      };
    },

    strikesOf: listDtos,

    async strikeDetail(strikeId) {
      const strike = await strikes.find(strikeId);
      if (!strike) return null;
      const authors = await identity.accountSummaries(strike.comments.map((row) => row.authorId));
      return {
        ...toDto(strike, strike.appeal, strike.article),
        accountId: strike.accountId,
        issuedBy: strike.issuedBy,
        issuedByRole: strike.issuedByRole,
        categoryId: strike.categoryId,
        fromReport: strike.fromReport,
        statement: strike.appeal?.statement ?? null,
        comments: strike.comments.map((row) => ({
          id: row.id,
          authorId: row.authorId,
          authorName: authors.get(row.authorId)?.displayName ?? null,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
        })),
        permanentReviewAt: strike.permanentReviewAt?.toISOString() ?? null,
      };
    },

    myStrikes: (actor) => listDtos(actor.accountId),

    async fileAppeal(actor, strikeId, statement) {
      const now = clock();
      return strikes.inTransaction(async (tx) => {
        const strike = await strikes.lock(tx, strikeId);
        if (!strike || strike.accountId !== actor.accountId) throw notFound();
        if (strike.kind === 'serious') {
          throw new ConflictError(
            'Gậy nghiêm trọng khiếu nại qua kênh hỗ trợ, không qua app',
            'APPEAL_VIA_SUPPORT',
          );
        }
        if (strike.appeal) throw alreadyUsed();
        if (!inForce(strike, now))
          throw new ConflictError('Gậy này không còn hiệu lực', 'STRIKE_NOT_ACTIVE');
        if (!appealOpen(strike.issuedAt, now, rules().appealDays)) throw windowClosed();
        const appeal = await strikes.createAppeal(tx, {
          strikeId: strike.id,
          accountId: actor.accountId,
          channel: 'app',
          statement,
          filedAt: now,
        });
        await strikes.emitIn(tx, [
          trustEvent(TRUST_EVENTS.appealFiled, {
            appealId: appeal.id,
            strikeId: strike.id,
            accountId: strike.accountId,
            kind: strike.kind,
            categoryId: strike.categoryId,
            issuedBy: strike.issuedBy,
          }),
        ]);
        return toDto(strike, appeal, strike.article);
      });
    },

    async requestSeriousAppealCode(email) {
      const found = await seriousPendingOf(email);
      if (found) await identity.requestLockedAppealCode(found.accountId);
    },

    async fileSeriousAppeal({ email, code, statement }) {
      const found = await seriousPendingOf(email);
      // Cùng một câu cho "không có tài khoản", "không bị khoá vì gậy" và "mã sai": không lộ gì (spec serious-strikes).
      if (!found || !(await identity.consumeLockedAppealCode(found.accountId, code))) {
        throw new UnauthorizedError('Mã không đúng hoặc đã hết hạn');
      }
      const now = clock();
      return strikes.inTransaction(async (tx) => {
        const strike = await strikes.lock(tx, found.strike.id);
        if (!strike) throw notFound();
        await lockedSerious(strike);
        if (strike.appeal) throw alreadyUsed();
        if (!appealOpen(strike.issuedAt, now, rules().seriousAppealDays)) throw windowClosed();
        const appeal = await strikes.createAppeal(tx, {
          strikeId: strike.id,
          accountId: strike.accountId,
          channel: 'support',
          statement,
          filedAt: now,
        });
        await strikes.emitIn(tx, [
          trustEvent(TRUST_EVENTS.appealFiled, {
            appealId: appeal.id,
            strikeId: strike.id,
            accountId: strike.accountId,
            kind: strike.kind,
            categoryId: null,
            issuedBy: strike.issuedBy,
          }),
        ]);
        return {
          strikeId: strike.id,
          ruleText: strike.ruleText,
          issuedAt: strike.issuedAt.toISOString(),
          appealUntil: appealUntil(strike.issuedAt, rules().seriousAppealDays).toISOString(),
          appealStatus: appeal.status,
        };
      });
    },

    async decideAppeal(tx, { strikeId, verdict, by, at }) {
      const strike = await strikes.lock(tx, strikeId);
      if (!strike) throw notFound();
      const appeal = await strikes.updateAppeal(tx, strike.id, {
        status: verdict,
        decidedAt: at,
        decidedBy: by,
      });
      if (!appeal) throw new ConflictError('Khiếu nại này đã có kết quả', 'APPEAL_DECIDED');
      if (verdict === 'lost' || !inForce(strike, at)) return;
      const events = await cancelIn(tx, strike, 'appeal', by, at);
      await strikes.emitIn(tx, [...events, await standingEvents(tx, strike.accountId)]);
    },

    async decideSerious(tx, { strikeId, decision, by, at }) {
      const strike = await strikes.lock(tx, strikeId);
      if (!strike) throw notFound();
      await lockedSerious(strike);
      const events: OutboxEventInput[] = [];
      if (decision === 'permanent') {
        await strikes.update(tx, strike.id, {
          status: 'permanent',
          seriousDecision: 'permanent',
          seriousDecidedAt: at,
          seriousDecidedBy: by,
          permanentReviewAt: new Date(at.getTime() + rules().permanentReviewYears * YEAR_MS),
        });
      } else if (decision === 'downgrade') {
        // 180 ngày tính từ ngày ra gậy nghiêm trọng, không từ ngày quyết (spec serious-strikes).
        const expiresAt = expiresAtOf('severe', strike.issuedAt, rules());
        await strikes.update(tx, strike.id, {
          kind: 'severe',
          points: pointsOf('severe', rules()),
          expiresAt,
          status: expiresAt && expiresAt <= at ? 'expired' : 'active',
          seriousDecision: 'downgrade',
          seriousDecidedAt: at,
          seriousDecidedBy: by,
        });
      } else {
        await strikes.update(tx, strike.id, {
          seriousDecision: 'cancel',
          seriousDecidedAt: at,
          seriousDecidedBy: by,
        });
        events.push(...(await cancelIn(tx, strike, 'serious_cancel', by, at)));
        // Trả lại số ngày hiển thị đã trôi trong lúc khoá (spec listing/display-period) — một lần, trong transaction.
        await listings.compensateLockedDays(tx, {
          accountId: strike.accountId,
          ms: at.getTime() - strike.issuedAt.getTime(),
        });
      }
      if (strike.appeal?.status === 'pending') {
        await strikes.updateAppeal(tx, strike.id, {
          status: decision === 'cancel' ? 'won' : 'lost',
          decidedAt: at,
          decidedBy: by,
        });
      }
      await strikes.emitIn(tx, [
        ...events,
        trustEvent(TRUST_EVENTS.strikeDecided, {
          strikeId: strike.id,
          accountId: strike.accountId,
          decision,
          by,
        }),
        await standingEvents(tx, strike.accountId),
      ]);
    },

    async decidePermanentReview(tx, { strikeId, decision, by, at }) {
      const strike = await strikes.lock(tx, strikeId);
      if (!strike) throw notFound();
      if (strike.status !== 'permanent') {
        throw new ConflictError(
          'Gậy này không phải khoá vĩnh viễn đang chờ xem lại',
          'STRIKE_NOT_PENDING',
        );
      }
      if (decision === 'keep') {
        await strikes.update(tx, strike.id, {
          permanentReviewAt: new Date(at.getTime() + rules().permanentReviewYears * YEAR_MS),
        });
        await strikes.emitIn(tx, [
          trustEvent(TRUST_EVENTS.strikeDecided, {
            strikeId: strike.id,
            accountId: strike.accountId,
            decision: 'kept',
            by,
          }),
        ]);
        return;
      }
      await strikes.update(tx, strike.id, {
        status: 'lifted',
        liftedAt: at,
        liftedBy: by,
        permanentReviewAt: null,
      });
      await strikes.emitIn(tx, [
        trustEvent(TRUST_EVENTS.strikeDecided, {
          strikeId: strike.id,
          accountId: strike.accountId,
          decision: 'lifted',
          by,
        }),
        await standingEvents(tx, strike.accountId),
      ]);
    },

    async lift(actor, strikeId) {
      if (actor.role !== 'master') throw new ForbiddenError('Chỉ master gỡ được khoá vĩnh viễn');
      const at = clock();
      await strikes.inTransaction(async (tx) => {
        await this.decidePermanentReview(tx, {
          strikeId,
          decision: 'lift',
          by: actor.accountId,
          at,
        });
        await strikes.auditIn(tx, {
          ...auditActor(actor),
          action: 'trust.strike.lift',
          targetType: 'strike',
          targetId: strikeId,
        });
      });
      const strike = await strikes.find(strikeId);
      if (!strike) throw notFound();
      return toDto(strike, strike.appeal, strike.article);
    },

    async amnesty(actor, accountId, { strikeIds, reason }) {
      if (actor.role !== 'master') throw new ForbiddenError('Chỉ master ân xá được');
      const at = clock();
      await strikes.inTransaction(async (tx) => {
        await strikes.lockAccount(tx, accountId);
        const events: OutboxEventInput[] = [];
        await sequentially(strikeIds, async (strikeId) => {
          const strike = await strikes.lock(tx, strikeId);
          if (!strike || strike.accountId !== accountId) throw notFound();
          if (strike.kind === 'serious') {
            throw new ConflictError(
              'Gậy nghiêm trọng quyết qua việc của master, không ân xá',
              'OUTCOME_NOT_ALLOWED',
            );
          }
          if (!inForce(strike, at)) {
            throw new ConflictError('Gậy này không còn hiệu lực', 'STRIKE_NOT_ACTIVE');
          }
          events.push(...(await cancelIn(tx, strike, 'amnesty', actor.accountId, at)));
          await strikes.auditIn(tx, {
            ...auditActor(actor),
            action: 'trust.strike.amnesty',
            targetType: 'strike',
            targetId: strike.id,
            reason,
            details: { accountId },
          });
        });
        await strikes.emitIn(tx, [...events, await standingEvents(tx, accountId)]);
      });
      return listDtos(accountId);
    },

    async addComment(actor, strikeId, body) {
      const strike = await strikes.find(strikeId);
      if (!strike) throw notFound();
      if (actor.role !== 'master') {
        const grant = await privileges.staffGrant(actor.accountId);
        if (grant?.status !== 'active') throw new ForbiddenError();
      }
      if (strike.issuedBy === actor.accountId) {
        throw new ForbiddenError('Người ra gậy không ghi nhận xét vào hồ sơ gậy của mình');
      }
      await lockedSerious(strike);
      const row = await strikes.addComment({
        strikeId,
        authorId: actor.accountId,
        body,
        createdAt: clock(),
      });
      return {
        id: row.id,
        strikeId: row.strikeId,
        authorId: row.authorId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async ruleArticles(input) {
      return (await strikes.listArticles(input)).map(toArticle);
    },

    async ruleArticle(id) {
      const row = await strikes.findArticle(id);
      return row ? toArticle(row) : null;
    },

    async createRuleArticle(actor, body) {
      if (actor.role !== 'master') throw new ForbiddenError('Chỉ master soạn quy định sàn');
      return toArticle(
        await strikes.createArticle({
          code: body.code,
          title: body.title,
          text: body.text,
          sort: body.sort ?? 0,
        }),
      );
    },

    async updateRuleArticle(actor, id, body) {
      if (actor.role !== 'master') throw new ForbiddenError('Chỉ master soạn quy định sàn');
      const row = await strikes.updateArticle(id, {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.text === undefined ? {} : { text: body.text }),
        ...(body.active === undefined ? {} : { active: body.active }),
        ...(body.sort === undefined ? {} : { sort: body.sort }),
      });
      if (!row) throw new NotFoundError('Không có điều này');
      return toArticle(row);
    },

    async ensureRuleArticles() {
      return { ruleArticles: await strikes.seedArticlesIfEmpty(DEFAULT_RULE_ARTICLES) };
    },

    async onAccountCreated(accountId, emailHash) {
      const now = clock();
      const live = (await strikes.activeByEmailHash(emailHash)).filter(
        (row) => row.accountId !== accountId && inForce(row, now),
      );
      if (live.length === 0) return;
      await strikes.inTransaction(async (tx) => {
        await strikes.lockAccount(tx, accountId);
        // Chạy lại vô hại: gậy đã kế thừa cho tài khoản này thì thôi.
        const mine = await strikes.listOf(accountId, tx);
        const fresh = live.filter((row) => !mine.some((own) => own.inheritedFromId === row.id));
        const events: OutboxEventInput[] = [];
        await sequentially(fresh, async (source) => {
          const copy = await strikes.insert(tx, {
            accountId,
            kind: source.kind,
            points: source.points,
            ruleArticleId: source.ruleArticleId,
            ruleText: source.ruleText,
            issuedBy: source.issuedBy,
            issuedByRole: source.issuedByRole,
            categoryId: source.categoryId,
            fromReport: source.fromReport,
            listingId: null,
            decisionId: source.decisionId,
            emailHashes: [emailHash],
            inheritedFromId: source.id,
            issuedAt: source.issuedAt,
            expiresAt: source.expiresAt,
          });
          events.push(issuedEvent(copy, true));
        });
        if (events.length > 0) {
          await strikes.emitIn(tx, [...events, await standingEvents(tx, accountId)]);
        }
      });
    },

    onEmailChanged: (accountId, emailHash) => strikes.addEmailHash(accountId, emailHash),

    async expireStrikes() {
      const now = clock();
      const expired = await strikes.inTransaction(async (tx) => {
        const rows = await strikes.expireDue(tx, now);
        if (rows.length === 0) return rows;
        const accounts = [...new Set(rows.map((row) => row.accountId))];
        const standings = await Promise.all(accounts.map((id) => standingEvents(tx, id)));
        await strikes.emitIn(tx, [
          ...rows.map((row) =>
            trustEvent(TRUST_EVENTS.strikeExpired, {
              strikeId: row.id,
              accountId: row.accountId,
              kind: row.kind,
            }),
          ),
          ...standings,
        ]);
        return rows;
      });
      await sequentially([...new Set(expired.map((row) => row.accountId))], async (id) => {
        await onChanged(id);
      });
      return expired.length;
    },

    async permanentReviewsDue() {
      const due = await strikes.permanentReviewDue(clock());
      await sequentially(due, (row) =>
        strikes.inTransaction((tx) =>
          strikes.emitIn(tx, [
            trustEvent(TRUST_EVENTS.strikeReviewDue, {
              strikeId: row.id,
              accountId: row.accountId,
            }),
          ]),
        ),
      );
      return due.length;
    },

    async strikesOfListings(listingIds) {
      const facts = new Map<string, StrikeFact>();
      // Mới trước: dòng đầu của mỗi tin là gậy mới nhất.
      for (const row of await strikes.ofListings([...new Set(listingIds)])) {
        if (!row.listingId || facts.has(row.listingId)) continue;
        facts.set(row.listingId, {
          id: row.id,
          kind: row.kind,
          status: row.status,
          issuedAt: row.issuedAt,
          expiresAt: row.expiresAt,
          cancelledAt: row.cancelledAt,
          liftedAt: row.liftedAt,
          appealPending: row.appeal?.status === 'pending',
        });
      }
      return facts;
    },

    anonymizeDue: (closedBefore, limit) => strikes.anonymizeDue(closedBefore, limit),

    anonymizeStrike: (tx, input) => strikes.anonymize(tx, { ...input, at: clock() }),

    dropLiftedEmailHashes: () => strikes.dropLiftedEmailHashes(),

    onAccountsPurged: (accountIds) => strikes.deleteOfAccounts(accountIds),
  };
}
