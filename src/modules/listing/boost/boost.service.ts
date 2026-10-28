import type { Listing } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import {
  type AuditAction,
  auditActor,
  type AuditDetails,
  type AuditEntry,
} from '../../../common/audit/audit.js';
import {
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../../common/errors/app-error.js';
import { formatMomentVN } from '../../../common/time/time.js';
import {
  activeFeaturedUntil,
  boostBlock,
  boostRole,
  type BoostRole,
  bumpRetryAt,
} from '../calc/boost.calc.js';
import { DAY_MS } from '../calc/display-period.calc.js';
import type { BoostWrite, Tx } from '../listing.repository.js';
import type { BoostBody, BoostStateDto } from '../listing.schema.js';
import {
  type ListingShared,
  listingNotFound,
  validationError,
  versionConflict,
} from '../listing.shared.js';

export interface ListingBoostService {
  /** Hỏi trước: vai, đẩy được không, mốc đẩy lại, hạn nổi bật — để app chỉ hiện nút khi có quyền. */
  boostState(actor: Actor, id: string): Promise<BoostStateDto>;
  /** Đẩy lên đầu hay đặt nổi bật N ngày (spec listing/boosting). */
  boost(actor: Actor, id: string, body: BoostBody): Promise<BoostStateDto>;
  /** Bỏ nổi bật ở mọi trạng thái; tin không đang nổi bật thì thành công mà không đổi gì. */
  unfeature(actor: Actor, id: string): Promise<BoostStateDto>;
  /**
   * Cổng cho gói đẩy tin (add-promotions), trong transaction của lượt mua: tin phải đúng `version` app gửi (lệch → 409
   * `CONFLICT`, không trừ Xu), đang hiển thị đầy đủ (không → 409 `LISTING_NOT_PROMOTABLE` với câu của `boostBlock`),
   * rồi cùng câu `UPDATE` của đẩy tin người quản trị. Không nhật ký — sổ cái và lượt mua là bản ghi.
   */
  applyPromotion(tx: Tx, input: PromotionWrite): Promise<void>;
}

export interface PromotionWrite {
  listingId: string;
  version: number;
  effect: 'rank_to_top' | 'featured';
  /** Hạn nổi bật mới (`featured`); `rank_to_top` bỏ trống. */
  until?: Date;
  at: Date;
}

const listingNotPromotable = (message: string): ConflictError =>
  new ConflictError(message, 'LISTING_NOT_PROMOTABLE');

const boostNotAllowed = (message: string): ConflictError =>
  new ConflictError(message, 'BOOST_NOT_ALLOWED');

const bumpCooldown = (retryAt: Date): TooManyRequestsError =>
  new TooManyRequestsError(
    `Tin vừa được đẩy lên đầu — đẩy lại được từ ${formatMomentVN(retryAt)}`,
    'BOOST_COOLDOWN',
    { retryAt: retryAt.toISOString() },
  );

/** Dòng nhật ký: chỉ vai, số ngày, hạn — không nội dung tin (TK 27 cam kết 31). */
const audit = (
  actor: Actor,
  id: string,
  action: AuditAction,
  details: AuditDetails,
): AuditEntry => ({
  ...auditActor(actor),
  action,
  targetType: 'listing',
  targetId: id,
  details,
});

/**
 * Đẩy tin của người quản trị, miễn phí (change add-admin-boost): master, staff của danh mục, quản trị nhóm trong phạm vi
 * mình. Phạm vi đọc trước khi khoá để transaction ngắn; trạng thái tin, thời gian chờ kiểm lại trên dòng đã khoá — hai
 * người đẩy cùng lúc thì người sau thấy `last_bumped_at` mới và nhận 429 (design mục 3).
 */
export function createListingBoostService(shared: ListingShared): ListingBoostService {
  const { repository, groups, privileges, config, clock } = shared;

  const found = async (id: string): Promise<Listing> => {
    const listing = await repository.findById(id);
    if (!listing || listing.deletedAt !== null) throw listingNotFound();
    return listing;
  };

  /** Vai đẩy tin của người gọi với tin này; ngoài phạm vi → 403 (tin không có → 404 trước đó). */
  const roleOver = async (actor: Actor, listing: Listing): Promise<BoostRole> => {
    const isMaster = actor.role === 'master';
    const inGroup = listing.placement !== 'marketplace' && listing.groupId !== null;
    const [grant, reviewers] = await Promise.all([
      isMaster || inGroup ? null : privileges.staffGrant(actor.accountId),
      !isMaster && inGroup && listing.groupId ? groups.reviewersOf(listing.groupId) : null,
    ]);
    const role = boostRole({ actorId: actor.accountId, isMaster, listing, grant, reviewers });
    if (!role) throw new ForbiddenError('Tin này ngoài phạm vi bạn quản lý');
    return role;
  };

  const cooldownHours = () => config.get('promotion.bumpCooldownHours');

  const stateOf = (listing: Listing, role: BoostRole, now: Date): BoostStateDto => ({
    role,
    blocked: boostBlock(listing),
    bumpRetryAt: bumpRetryAt(listing.lastBumpedAt, cooldownHours(), now)?.toISOString() ?? null,
    featuredUntil: activeFeaturedUntil(listing.featuredUntil, now)?.toISOString() ?? null,
    featuredMaxDays: config.get('promotion.featuredMaxDays'),
  });

  /** Cột mới cho một lượt đẩy lên đầu / đặt nổi bật trên dòng đã khoá — hay ném lý do từ chối. */
  const writeFor = (
    body: BoostBody,
    locked: Listing,
    now: Date,
  ): { write: BoostWrite; action: AuditAction; details: AuditDetails } => {
    const blocked = boostBlock(locked);
    if (blocked) throw boostNotAllowed(blocked);
    if (body.effect === 'rank_to_top') {
      const retryAt = bumpRetryAt(locked.lastBumpedAt, cooldownHours(), now);
      if (retryAt) throw bumpCooldown(retryAt);
      return {
        write: { kind: 'rank_to_top', at: now },
        action: 'listing.listing.bump',
        details: {},
      };
    }
    const until = new Date(now.getTime() + body.days * DAY_MS);
    return {
      write: { kind: 'featured', until },
      action: 'listing.listing.feature',
      details: { days: body.days, featuredUntil: until.toISOString() },
    };
  };

  return {
    async boostState(actor, id) {
      const listing = await found(id);
      const role = await roleOver(actor, listing);
      return stateOf(listing, role, clock());
    },

    async boost(actor, id, body) {
      const maxDays = config.get('promotion.featuredMaxDays');
      if (body.effect === 'featured' && (body.days < 1 || body.days > maxDays)) {
        throw validationError(`Số ngày nổi bật phải từ 1 tới ${maxDays}`, { field: 'days' });
      }
      const role = await roleOver(actor, await found(id));
      const now = clock();
      const updated = await repository.boost({
        id,
        decide: (locked) => {
          const { write, action, details } = writeFor(body, locked, now);
          return { write, audit: audit(actor, id, action, { role, ...details }) };
        },
      });
      if (!updated) throw listingNotFound();
      return stateOf(updated, role, now);
    },

    async unfeature(actor, id) {
      const role = await roleOver(actor, await found(id));
      const now = clock();
      const updated = await repository.boost({
        id,
        decide: (locked) =>
          activeFeaturedUntil(locked.featuredUntil, now)
            ? {
                write: { kind: 'featured', until: null },
                audit: audit(actor, id, 'listing.listing.unfeature', { role }),
              }
            : null,
      });
      if (!updated) throw listingNotFound();
      return stateOf(updated, role, now);
    },

    async applyPromotion(tx, input) {
      const applied = await repository.applyBoostIn(tx, input.listingId, (locked) => {
        if (locked.version !== input.version) throw versionConflict();
        const blocked = boostBlock(locked);
        if (blocked) throw listingNotPromotable(blocked);
        return {
          write:
            input.effect === 'rank_to_top'
              ? { kind: 'rank_to_top', at: input.at }
              : { kind: 'featured', until: input.until ?? null },
        };
      });
      if (!applied) throw listingNotFound();
    },
  };
}
