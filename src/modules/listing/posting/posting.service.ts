import type { Listing, Prisma } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { formatDateVN } from '../../../common/time/time.js';
import { imageNotInStorage } from '../../media/media.service.js';
import { nextClock, renewEarlyCheck } from '../calc/display-period.calc.js';
import { isDetached, reasonsAfterRecheck, reasonsAfterRewrite } from '../calc/hide.calc.js';
import { transition } from '../calc/listing.calc.js';
import { LISTING_EVENTS, listingEvent, stateChangedEvent } from '../listing.outbox.js';
import {
  type CreateListingBody,
  LISTING_STATES,
  type OwnListingDto,
  type PatchListingBody,
} from '../listing.schema.js';
import {
  clockSettings,
  EDITABLE_STATES,
  invalidTransition,
  listingDeleteBlocked,
  listingDetached,
  listingUnderViolation,
  type ListingShared,
  listingNotFound,
  placementLocked,
  validationError,
  versionConflict,
} from '../listing.shared.js';
import { classifyEdit } from './edit.calc.js';
import { createMoveToMarketplace } from './move.service.js';
import {
  contentData,
  createSubmission,
  fieldsOf,
  keepSystemColumns,
  type ListingFields,
  tooManyImages,
} from './submission.service.js';

export interface ListingPostingService {
  createDraft(actor: Actor, body: CreateListingBody): Promise<OwnListingDto>;
  /** Lưu nháp, hoặc sửa tin đã gửi (qua máy lại hay áp dụng ngay — spec editing). */
  update(
    actor: Actor,
    id: string,
    body: PatchListingBody,
    deviceId: string | null,
  ): Promise<OwnListingDto>;
  submit(
    actor: Actor,
    id: string,
    version: number,
    deviceId: string | null,
  ): Promise<OwnListingDto>;
  withdraw(actor: Actor, id: string): Promise<OwnListingDto>;
  renew(
    actor: Actor,
    id: string,
    body: PatchListingBody,
    deviceId: string | null,
  ): Promise<OwnListingDto>;
  markSold(actor: Actor, id: string): Promise<OwnListingDto>;
  remove(actor: Actor, id: string): Promise<void>;
  /** Tin đã rời nhóm hẳn thành một tin MỚI ở sàn chung, mỗi tin một lần, trong hạn (design mục 13). */
  moveToMarketplace(
    actor: Actor,
    id: string,
    body: { provinceCode?: number | undefined; wardCode?: number | undefined },
    deviceId: string | null,
  ): Promise<OwnListingDto>;
}

/** Phần sửa đè lên giá trị đang có; ô không gửi giữ nguyên — so giá trị là việc của `classifyEdit`. */
function merge(before: ListingFields, body: Partial<CreateListingBody>): ListingFields {
  const pick = <K extends keyof ListingFields>(key: K, value: ListingFields[K] | undefined) =>
    value === undefined ? before[key] : value;
  const placement = pick('placement', body.placement);
  return {
    title: body.title === undefined ? before.title : body.title || null,
    description: body.description === undefined ? before.description : body.description || null,
    price: pick('price', body.price),
    negotiable: pick('negotiable', body.negotiable),
    delivery: pick('delivery', body.delivery),
    showPhone: pick('showPhone', body.showPhone),
    categoryId: pick('categoryId', body.categoryId),
    attributes:
      body.attributes === undefined ? before.attributes : (body.attributes as Prisma.JsonValue),
    provinceCode: pick('provinceCode', body.provinceCode),
    wardCode: pick('wardCode', body.wardCode),
    placement,
    groupId: placement === 'marketplace' ? null : pick('groupId', body.groupId),
    imageIds: pick('imageIds', body.imageIds),
    badgeGroupId: pick('badgeGroupId', body.badgeGroupId),
  };
}

const sameFields = (a: ListingFields, b: ListingFields): boolean =>
  JSON.stringify(a, (_, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  ) ===
  JSON.stringify(b, (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));

export function createListingPostingService(shared: ListingShared): ListingPostingService {
  const {
    repository,
    groups,
    categories,
    regions,
    media,
    openWork,
    config,
    clock,
    ownedBy,
    explainMiss,
    toOwnDto,
  } = shared;
  const submission = createSubmission(shared);
  const own = (row: Listing) => toOwnDto(row, clock());

  /**
   * Kiểm được ngay cả lúc lưu nháp (D9): số ảnh, khu vực có thật, mẫu thông tin (không đòi mục bắt buộc). Trả danh mục
   * có đang bật không — lưu nháp cần nó để gỡ "danh mục bị tắt" khi đổi danh mục (C7).
   */
  const assertDraftFields = async (
    listing: Listing | null,
    fields: ListingFields,
  ): Promise<boolean> => {
    const max = config.get('listing.maxImages');
    if (fields.imageIds.length > max) throw tooManyImages(max);
    if (fields.wardCode !== null && fields.provinceCode === null) {
      throw validationError('Chọn tỉnh / thành trước khi chọn phường / xã');
    }
    if (fields.provinceCode !== null) {
      const issue = await regions.validateRegion(fields.provinceCode, fields.wardCode);
      if (issue) throw validationError(issue);
    }
    if (fields.badgeGroupId !== null && fields.placement !== 'marketplace') {
      throw validationError('Huy hiệu nhóm chỉ gắn lên tin sàn chung');
    }
    // Cặp nơi đăng ↔ nhóm là CHECK của bảng ngay cả ở nháp: báo đúng lỗi thay vì để DB ném 409 vô danh.
    if (
      fields.placement !== null &&
      fields.placement !== 'marketplace' &&
      fields.groupId === null
    ) {
      throw validationError('Chọn nhóm cho tin đăng trong nhóm');
    }
    if (fields.groupId !== null && !(await groups.findGroup(fields.groupId))) {
      throw new NotFoundError('Không có nhóm này');
    }
    const attributes = fields.attributes ?? {};
    if (fields.categoryId === null) {
      if (Object.keys(attributes as object).length > 0) {
        throw validationError('Chọn danh mục trước khi điền thông tin theo mẫu');
      }
      return false;
    }
    const category = (await categories.statusOf([fields.categoryId])).get(fields.categoryId);
    if (!category) throw validationError('Không có danh mục này');
    const version =
      listing?.templateVersion !== null && listing?.categoryId === fields.categoryId
        ? (listing?.templateVersion ?? null)
        : category.templateVersion;
    const issues = await categories.validateAttributes(fields.categoryId, version, attributes, {
      complete: false,
    });
    if (issues.length > 0) throw validationError(issues.join('; '));
    return category.enabled;
  };

  /** Gắn huy hiệu (design mục 14): một huy hiệu mỗi tin, huy hiệu nhóm đã gỡ thì không gắn lại, phải đang có quyền. */
  const assertBadge = async (listing: Listing, fields: ListingFields): Promise<void> => {
    if (fields.badgeGroupId === null || fields.badgeGroupId === listing.badgeGroupId) return;
    if (listing.badgeGroupId !== null) {
      throw new ConflictError('Tin đã mang huy hiệu của một nhóm khác', 'BADGE_ALREADY_ATTACHED');
    }
    const blocked = await repository.badgeBlocked(listing.id, fields.badgeGroupId);
    if (blocked) {
      throw new ForbiddenError('Nhóm đã gỡ huy hiệu này khỏi tin', 'BADGE_REMOVED_BY_GROUP');
    }
    const holders = await groups.badgeHolders(fields.badgeGroupId, [listing.ownerId]);
    if (!holders.has(listing.ownerId)) {
      throw new ForbiddenError(
        'Bạn chưa có quyền mang huy hiệu của nhóm này',
        'BADGE_NOT_ELIGIBLE',
      );
    }
  };

  /** Lượt ghi không thành: tin đã xoá → 404, lệch phiên bản → 409 `CONFLICT`, còn lại là mũi tên không có. */
  const saveDraft = async (actor: Actor, listing: Listing, body: PatchListingBody) => {
    if (isDetached(listing.hideReasons)) throw listingDetached();
    const after = merge(fieldsOf(listing), body);
    const categoryEnabled = await assertDraftFields(listing, after);
    await assertBadge(listing, after);
    const owner = { kind: 'listing' as const, id: listing.id };
    await media.resolve({ owner, uploaderId: actor.accountId, imageIds: after.imageIds });
    const rewrite = {
      groupChanged: listing.groupId !== after.groupId,
      categoryEnabledNow: categoryEnabled && listing.categoryId !== after.categoryId,
    };
    const result = await repository.change({
      id: listing.id,
      states: ['draft'],
      version: body.version,
      data: (locked) => ({
        ...contentData(after),
        ...keepSystemColumns(listing, after, locked),
        hideReasons: reasonsAfterRewrite(locked.hideReasons, rewrite),
        version: locked.version + 1,
      }),
      after: (tx) => media.attach(tx, { owner, imageIds: after.imageIds }),
    });
    return result?.after ?? explainMiss(listing.id, body.version);
  };

  /** Sửa không qua máy: thu hẹp về nhóm mình, bỏ huy hiệu, ba công tắc — áp ngay, trạng thái giữ nguyên. */
  const applyNow = async (
    actor: Actor,
    listing: Listing,
    after: ListingFields,
    version: number,
    outcome: { placement: string | null },
  ) => {
    const now = clock();
    // Thu hẹp vào nhóm: đơn vị của người đăng lấy lúc giữ khoá nhóm, như lượt gửi (fix-audit-review, T8).
    let unitId = listing.unitId;
    const result = await repository.change({
      id: listing.id,
      states: [listing.state],
      version,
      before: async (tx) => {
        if (outcome.placement) {
          unitId = (await submission.lockPlacement(tx, actor.accountId, after)).unitId;
        }
      },
      data: (locked) => {
        // Sửa không qua máy không đổi danh mục (classifyEdit đưa đổi danh mục qua máy).
        const hideReasons = reasonsAfterRewrite(locked.hideReasons, {
          groupChanged: locked.groupId !== after.groupId,
          categoryEnabledNow: false,
        });
        return {
          ...contentData(after),
          ...keepSystemColumns(listing, after, locked),
          unitId,
          version: locked.version + 1,
          hideReasons,
          ...nextClock(locked, { state: locked.state, hideReasons }, now, clockSettings(config)),
        };
      },
      events: (updated) => [
        listingEvent(LISTING_EVENTS.edited, {
          listingId: updated.id,
          version: updated.version,
          machine: false,
        }),
      ],
    });
    return result?.after ?? explainMiss(listing.id, version);
  };

  /**
   * Sửa tin đã gửi (spec editing, D3): so giá trị; qua máy thì đi như một lượt gửi lại với mũi tên "sửa", nơi đăng
   * mới chạy lại đủ luật; đổi nơi đăng ra khỏi nhóm thì lý do của nhóm ấy rơi theo.
   */
  const edit = async (
    actor: Actor,
    listing: Listing,
    body: PatchListingBody,
    deviceId: string | null,
  ) => {
    if (listing.state === 'expired') throw invalidTransition('Tin đã hết hạn — gia hạn để sửa');
    if (!EDITABLE_STATES.includes(listing.state)) throw invalidTransition();
    const before = fieldsOf(listing);
    const after = merge(before, body);
    if (sameFields(before, after)) return listing;
    await assertDraftFields(listing, after);
    const memberOfTarget =
      after.groupId !== null &&
      (await groups.membersAmong(after.groupId, [actor.accountId])).has(actor.accountId);
    const outcome = classifyEdit(before, after, {
      detached: isDetached(listing.hideReasons),
      placementLocked: listing.state === 'pending' || (await openWork.blocksPlacement(listing.id)),
      memberOfTarget,
    });
    if (!outcome.ok) {
      throw outcome.code === 'LISTING_DETACHED' ? listingDetached() : placementLocked();
    }
    if (outcome.badge === 'attach') await assertBadge(listing, after);
    if (!outcome.machine) return applyNow(actor, listing, after, body.version, outcome);
    if (transition(listing.state, 'edit', 'owner', listing.fault) === null) {
      throw listing.fault === 'violation' ? listingUnderViolation() : invalidTransition();
    }
    // Đổi sang danh mục khác thì bước 4 của lượt gửi đã từ chối danh mục đang tắt (spec suspension).
    const rewrite = {
      groupChanged: listing.groupId !== after.groupId,
      categoryEnabledNow: after.categoryId !== listing.categoryId,
    };
    const updated = await submission.submit({
      actor,
      listing,
      after,
      kind: 'resubmit',
      arrow: 'edit',
      version: body.version,
      deviceId,
      renewal: null,
      recheckPlacement: outcome.placement !== null,
      hideReasons: (locked) => reasonsAfterRewrite(locked, rewrite),
      restrictions: (locked) => [...locked],
    });
    return updated ?? explainMiss(listing.id, body.version);
  };

  return {
    async createDraft(actor, body) {
      if (actor.role === 'master') throw new ForbiddenError('Tài khoản master không đăng tin');
      const empty: ListingFields = {
        title: null,
        description: null,
        price: null,
        negotiable: false,
        delivery: false,
        showPhone: false,
        categoryId: null,
        attributes: {},
        provinceCode: null,
        wardCode: null,
        placement: null,
        groupId: null,
        imageIds: [],
        badgeGroupId: null,
      };
      const fields = merge(empty, body);
      // Ảnh tải cho chính tin này, mà tin chưa có trước lượt tạo: ảnh nào gửi kèm cũng không thể thuộc về nó.
      if (fields.imageIds.length > 0) throw imageNotInStorage();
      if (fields.badgeGroupId !== null) {
        throw validationError('Gắn huy hiệu sau khi đã tạo tin, trên tin sàn chung');
      }
      await assertDraftFields(null, fields);
      const created = await repository.create({
        data: { ownerId: actor.accountId, ...contentData(fields) },
      });
      return own(created);
    },

    async update(actor, id, body, deviceId) {
      const listing = await ownedBy(actor, id);
      const updated =
        listing.state === 'draft'
          ? await saveDraft(actor, listing, body)
          : await edit(actor, listing, body, deviceId);
      return own(updated);
    },

    async submit(actor, id, version, deviceId) {
      const listing = await ownedBy(actor, id);
      if (listing.state !== 'draft') {
        // Bấm Đăng hai lần: lượt sau nhận lại đúng tin của lượt đầu, không tính thêm lượt gửi (chốt 12/10/2026).
        if (await repository.findSubmission(id, version)) return own(listing);
        throw invalidTransition('Tin không còn là nháp');
      }
      if (listing.version !== version) throw versionConflict();
      if (isDetached(listing.hideReasons)) throw listingDetached();
      const updated = await submission.submit({
        actor,
        listing,
        after: fieldsOf(listing),
        kind: 'submit',
        arrow: 'submit',
        version,
        deviceId,
        renewal: listing.renewal,
        recheckPlacement: true,
        hideReasons: reasonsAfterRecheck,
        restrictions: (locked) => [...locked],
      });
      if (updated) return own(updated);
      const fresh = await repository.findById(id);
      if (fresh && (await repository.findSubmission(id, version))) return own(fresh);
      return explainMiss(id, version);
    },

    async withdraw(actor, id) {
      const listing = await ownedBy(actor, id);
      if (transition(listing.state, 'withdraw', 'owner') === null) throw invalidTransition();
      if (isDetached(listing.hideReasons)) throw listingDetached();
      const now = clock();
      const result = await repository.change({
        id,
        states: ['pending'],
        before: async (_tx, locked) => {
          if (isDetached(locked.hideReasons)) throw listingDetached();
        },
        data: (locked) => ({
          state: 'draft',
          version: locked.version + 1,
          ...nextClock(
            locked,
            { state: 'draft', hideReasons: locked.hideReasons },
            now,
            clockSettings(config),
          ),
        }),
        events: (updated, locked) => [stateChangedEvent(updated, locked, 'withdraw')],
      });
      return own(result?.after ?? (await explainMiss(id, listing.version)));
    },

    async renew(actor, id, body, deviceId) {
      const listing = await ownedBy(actor, id);
      const now = clock();
      const early = listing.state === 'live';
      if (transition(listing.state, early ? 'renewEarly' : 'renew', 'owner') === null) {
        throw invalidTransition('Chỉ gia hạn được tin đang hiển thị hay đã hết hạn');
      }
      if (isDetached(listing.hideReasons)) throw listingDetached();
      if (early) {
        const check = renewEarlyCheck(listing, now, config.get('listing.renewWindowDays'));
        if (!check.ok) {
          throw new ConflictError(
            `Chỉ gia hạn được trong ${config.get('listing.renewWindowDays')} ngày cuối — từ ${formatDateVN(check.opensAt)}`,
            'RENEWAL_TOO_EARLY',
          );
        }
      }
      const after = merge(fieldsOf(listing), body);
      await assertDraftFields(listing, after);
      const movesPlacement =
        after.placement !== listing.placement || after.groupId !== listing.groupId;
      if (movesPlacement && (await openWork.blocksPlacement(listing.id))) throw placementLocked();
      const updated = await submission.submit({
        actor,
        listing,
        after,
        kind: early ? 'renew_early' : 'renew_expired',
        arrow: early ? 'renewEarly' : 'renew',
        version: body.version,
        deviceId,
        renewal: early ? 'early' : 'expired',
        recheckPlacement: true,
        hideReasons: reasonsAfterRecheck,
        restrictions: (locked) => [...locked],
      });
      return own(updated ?? (await explainMiss(id, body.version)));
    },

    async markSold(actor, id) {
      const listing = await ownedBy(actor, id);
      if (transition(listing.state, 'markSold', 'owner') === null) throw invalidTransition();
      const now = clock();
      const result = await repository.change({
        id,
        states: ['live', 'expired'],
        data: (locked) => ({
          state: 'sold',
          version: locked.version + 1,
          ...nextClock(
            locked,
            { state: 'sold', hideReasons: locked.hideReasons },
            now,
            clockSettings(config),
          ),
        }),
        events: (updated, locked) => [stateChangedEvent(updated, locked, 'markSold')],
      });
      return own(result?.after ?? (await explainMiss(id, listing.version)));
    },

    async remove(actor, id) {
      const listing = await ownedBy(actor, id);
      // Tin bị từ chối / gỡ vì vi phạm là hồ sơ của gậy (spec listing/deletion, add-strikes).
      if (
        listing.fault === 'violation' &&
        (listing.state === 'rejected' || listing.state === 'removed')
      ) {
        throw listingDeleteBlocked();
      }
      const now = clock();
      const result = await repository.change({
        id,
        states: LISTING_STATES,
        data: (locked) => ({
          deletedAt: now,
          // Tin xoá thì khoảng "được thấy" đang mở khép lại — dữ kiện tin sạch của `trust` không tính tiếp.
          shownMs: locked.shownSince
            ? locked.shownMs + BigInt(now.getTime() - locked.shownSince.getTime())
            : locked.shownMs,
          shownSince: null,
        }),
        events: (updated) => [
          listingEvent(LISTING_EVENTS.deleted, { listingId: updated.id, ownerId: updated.ownerId }),
        ],
      });
      if (!result) throw listingNotFound();
    },

    moveToMarketplace: createMoveToMarketplace(shared, submission),
  };
}
