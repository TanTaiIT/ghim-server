import type {
  Listing,
  ListingHideReason,
  ListingRenewal,
  ListingRestriction,
  ListingSubmissionKind,
  Prisma,
} from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/app-error.js';
import { fold } from '../../../common/text/fold.js';
import { nextClock } from '../calc/display-period.calc.js';
import type { ListingArrow } from '../calc/listing.calc.js';
import { LISTING_EVENTS, listingEvent, stateChangedEvent } from '../listing.outbox.js';
import {
  clockSettings,
  type ListingShared,
  placementError,
  validationError,
} from '../listing.shared.js';
import { type ScreeningSubmission } from '../listing.ports.js';
import type { Tx } from '../listing.repository.js';
import { decideGroupPlacement, missingForSubmit, needsRegion } from '../calc/placement.calc.js';

/** Các trường người đăng soạn — trạng thái gộp của tin sau khi áp phần sửa. */
export interface ListingFields {
  title: string | null;
  description: string | null;
  price: bigint | null;
  negotiable: boolean;
  delivery: boolean;
  showPhone: boolean;
  categoryId: string | null;
  attributes: Prisma.JsonValue;
  provinceCode: number | null;
  wardCode: number | null;
  placement: Listing['placement'];
  groupId: string | null;
  imageIds: string[];
  badgeGroupId: string | null;
}

export const fieldsOf = (listing: Listing): ListingFields => ({
  title: listing.title,
  description: listing.description,
  price: listing.price,
  negotiable: listing.negotiable,
  delivery: listing.delivery,
  showPhone: listing.showPhone,
  categoryId: listing.categoryId,
  attributes: listing.attributes,
  provinceCode: listing.provinceCode,
  wardCode: listing.wardCode,
  placement: listing.placement,
  groupId: listing.groupId,
  imageIds: listing.imageIds,
  badgeGroupId: listing.badgeGroupId,
});

/** Cột nội dung ghi xuống, kèm chữ bỏ dấu cho tìm kiếm. */
export const contentData = (fields: ListingFields) => ({
  title: fields.title,
  description: fields.description,
  price: fields.price,
  negotiable: fields.negotiable,
  delivery: fields.delivery,
  showPhone: fields.showPhone,
  categoryId: fields.categoryId,
  attributes: (fields.attributes ?? {}) as Prisma.InputJsonValue,
  provinceCode: fields.provinceCode,
  wardCode: fields.wardCode,
  placement: fields.placement,
  groupId: fields.placement === 'marketplace' ? null : fields.groupId,
  imageIds: fields.imageIds,
  badgeGroupId: fields.badgeGroupId,
  searchFolded: fold([fields.title, fields.description].filter(Boolean).join(' ')),
});

/**
 * Nơi đăng, nhóm, huy hiệu mà hệ thống hạ / gỡ không tăng phiên bản (riêng tư hoá, mất quyền huy hiệu): ô nào người
 * đăng không đổi so với lúc đọc thì lấy theo dòng đã khoá, không đè bằng giá trị đọc trước khoá (fix-audit-listing, T14).
 */
export const keepSystemColumns = (read: Listing, after: ListingFields, locked: Listing) => {
  const placement = after.placement === read.placement ? locked.placement : after.placement;
  return {
    placement,
    groupId:
      placement === 'marketplace'
        ? null
        : after.groupId === read.groupId
          ? locked.groupId
          : after.groupId,
    badgeGroupId:
      after.badgeGroupId === read.badgeGroupId ? locked.badgeGroupId : after.badgeGroupId,
  };
};

const categoryDisabled = (): ConflictError =>
  new ConflictError('Danh mục này đang tạm tắt, chưa nhận tin', 'CATEGORY_DISABLED');

const MISSING_LABELS: Record<string, string> = {
  placement: 'nơi đăng',
  groupId: 'nhóm',
  title: 'tiêu đề',
  price: 'giá',
  categoryId: 'danh mục',
  images: 'ít nhất một ảnh',
};

export const tooManyImages = (max: number): BadRequestError =>
  new BadRequestError(`Mỗi tin tối đa ${max} ảnh`, 'TOO_MANY_IMAGES');

export interface SubmissionInput {
  actor: Actor;
  listing: Listing;
  after: ListingFields;
  kind: ListingSubmissionKind;
  arrow: ListingArrow;
  /** Phiên bản app gửi kèm — ghi có điều kiện, và là `from_version` của lượt gửi. */
  version: number;
  deviceId: string | null;
  renewal: ListingRenewal | null;
  /** Kiểm lại luật nơi đăng trong nhóm (gửi lần đầu, gia hạn, đổi nơi đăng); sửa nội dung thì không. */
  recheckPlacement: boolean;
  /** Lý do tạm ẩn / hạn chế sau lượt sửa — tính từ dòng đã khoá (D3, đổi danh mục). */
  hideReasons: (locked: ListingHideReason[]) => ListingHideReason[];
  restrictions: (locked: ListingRestriction[]) => ListingRestriction[];
}

/** Bản gửi cho máy chấm; `missingForSubmit` đã bắt buộc tiêu đề, danh mục, nơi đăng ở bước 4. */
export const screeningInput = (input: {
  listingId: string;
  actor: Actor;
  kind: ListingSubmissionKind;
  deviceHash: string;
  after: ListingFields;
  groupManual?: boolean;
}): ScreeningSubmission => ({
  listingId: input.listingId,
  accountId: input.actor.accountId,
  kind: input.kind,
  deviceHash: input.deviceHash,
  title: input.after.title ?? '',
  description: input.after.description,
  price: input.after.price,
  categoryId: input.after.categoryId ?? '',
  placement: input.after.placement ?? 'marketplace',
  imageIds: input.after.imageIds,
  groupManual: input.groupManual ?? false,
});

/**
 * Một lượt "gửi" — gửi nháp, gửi lại sau sửa, gia hạn — theo thứ tự kiểm cố định của design mục 5: rẻ trước, nên cùng
 * một lượt sai luôn ra cùng một lỗi; không dòng nào đổi khi bất kỳ bước nào ném (spec submission).
 */
export function createSubmission(shared: ListingShared) {
  const {
    repository,
    groups,
    categories,
    regions,
    media,
    identity,
    trust,
    screening,
    config,
    clock,
  } = shared;

  /** Bước 3: tài khoản và mã máy — mọi lượt gửi bắt buộc `x-device-id` (D2, TK 8). */
  const assertCanPost = async (
    actor: Actor,
    deviceId: string | null,
    kind: ListingSubmissionKind,
  ): Promise<string> => {
    if (actor.role === 'master') throw new ForbiddenError('Tài khoản master không đăng tin');
    if (!actor.emailVerified) {
      throw new ForbiddenError('Xác nhận email trước khi gửi tin', 'EMAIL_NOT_VERIFIED');
    }
    if (!deviceId) throw validationError('Thiếu mã thiết bị (header x-device-id)');
    await screening.precheck(actor.accountId, kind);
    return identity.deviceToken(deviceId);
  };

  /**
   * Bước 4: đủ trường, danh mục đang bật, mẫu thông tin, khu vực. Trả phiên bản mẫu tin sẽ mang. Sửa tin mà vẫn ở danh
   * mục cũ thì danh mục đang tắt không chặn: tin giữ lý do "danh mục bị tắt" và vẫn ẩn (spec suspension, "Còn lý do
   * của danh mục") — chỉ tin mới, gia hạn, chuyển lên sàn và đổi sang danh mục khác mới cần danh mục đang bật.
   */
  const assertSubmittable = async (
    listing: Listing,
    after: ListingFields,
    options: { editInPlace?: boolean } = {},
  ): Promise<number | null> => {
    const missing = missingForSubmit(after);
    if (missing.length > 0) {
      throw validationError(
        `Còn thiếu: ${missing.map((name) => MISSING_LABELS[name] ?? name).join(', ')}`,
      );
    }
    const max = config.get('listing.maxImages');
    if (after.imageIds.length > max) throw tooManyImages(max);
    const categoryId = after.categoryId ?? '';
    const category = (await categories.statusOf([categoryId])).get(categoryId);
    if (!category) throw validationError('Không có danh mục này');
    const keepsCategory = options.editInPlace === true && listing.categoryId === after.categoryId;
    if (!category.enabled && !keepsCategory) throw categoryDisabled();
    // Ghim mẫu ở lần gửi đầu; đổi sang danh mục khác thì mang mẫu hiện hành của danh mục mới (TK 11).
    const templateVersion =
      listing.templateVersion !== null && listing.categoryId === after.categoryId
        ? listing.templateVersion
        : category.templateVersion;
    const issues = await categories.validateAttributes(
      categoryId,
      templateVersion,
      after.attributes,
      {
        complete: true,
      },
    );
    if (issues.length > 0) throw validationError(issues.join('; '));
    if (needsRegion(after)) {
      throw new BadRequestError('Tin sàn chung cần tỉnh / thành và phường / xã', 'REGION_REQUIRED');
    }
    if (after.provinceCode !== null) {
      const issue = await regions.validateRegion(after.provinceCode, after.wardCode);
      if (issue) throw validationError(issue);
    }
    return templateVersion;
  };

  /** Bước 5, trong transaction: khoá nhóm cho lượt đăng và chạy luật nơi đăng trên ảnh chụp đó. */
  const lockPlacement = async (
    tx: Prisma.TransactionClient,
    accountId: string,
    after: ListingFields,
  ): Promise<{ unitId: string | null; outsider: boolean }> => {
    if (after.placement === 'marketplace' || !after.placement || !after.groupId) {
      return { unitId: null, outsider: false };
    }
    const snapshot = await groups.lockForPosting(tx, after.groupId, accountId);
    if (!snapshot) throw new NotFoundError('Không có nhóm này');
    const outcome = decideGroupPlacement(after.placement, snapshot);
    if (!outcome.ok) throw placementError(outcome.code);
    return { unitId: outcome.unitId, outsider: outcome.outsider };
  };

  /**
   * Trong transaction của lượt gửi: giữ `FOR SHARE` dòng tài khoản và dòng danh mục tới khi commit. Lượt khoá tài khoản
   * hay tắt danh mục chen giữa thì hoặc lượt gửi đọc thấy và từ chối, hoặc lượt đó chờ lượt gửi commit rồi bên nghe của
   * nó thấy tin đã ra khỏi nháp — tin không lên mà thiếu lý do tạm ẩn (fix-audit-listing, T15).
   */
  const assertStillPostable = async (
    tx: Tx,
    accountId: string,
    categoryId: string | null,
    keepsCategory: boolean,
  ): Promise<void> => {
    const status = await identity.lockAccountStatus(tx, accountId);
    if (status === 'locked') throw new ForbiddenError('Tài khoản đang bị khoá', 'ACCOUNT_LOCKED');
    if (status !== 'active') throw new ForbiddenError();
    const category = await categories.lockStatus(tx, categoryId ?? '');
    if (!category) throw validationError('Không có danh mục này');
    if (!category.enabled && !keepsCategory) throw categoryDisabled();
  };

  /** Sửa nội dung không khoá nhóm (nơi đăng không đổi): tư cách người ngoài đọc ngoài transaction là đủ cho trần riêng. */
  const outsiderOf = async (accountId: string, after: ListingFields): Promise<boolean> =>
    after.placement !== 'marketplace' &&
    after.groupId !== null &&
    !(await groups.membersAmong(after.groupId, [accountId])).has(accountId);

  /**
   * Công tắc duyệt tay của nhóm chỉ áp cho tin gửi mới và gửi lại (tin bị từ chối, bị gỡ, đang chờ); sửa tin đang hiện
   * và gia hạn chỉ qua máy (add-group-manual-review). Đọc ngoài transaction như lượt chấm: chủ nhóm đổi công tắc giữa
   * chừng thì lượt này theo giá trị lúc chấm.
   */
  const groupManualOf = async (input: SubmissionInput): Promise<boolean> => {
    const { kind, listing, after } = input;
    if (after.placement === 'marketplace' || !after.groupId) return false;
    if (kind !== 'submit' && kind !== 'resubmit') return false;
    if (kind === 'resubmit' && listing.state === 'live') return false;
    return (await groups.findGroup(after.groupId))?.manualReview ?? false;
  };

  const submit = async (input: SubmissionInput): Promise<Listing | null> => {
    const { actor, listing, after } = input;
    const deviceHash = await assertCanPost(actor, input.deviceId, input.kind);
    const templateVersion = await assertSubmittable(listing, after, {
      editInPlace: input.kind === 'resubmit',
    });
    const owner = { kind: 'listing' as const, id: listing.id };
    const score = await screening.scoreText(
      screeningInput({
        listingId: listing.id,
        actor,
        kind: input.kind,
        deviceHash,
        after,
        groupManual: await groupManualOf(input),
      }),
    );
    await media.resolve({ owner, uploaderId: actor.accountId, imageIds: after.imageIds });
    const now = clock();
    const outsiderWithoutLock = input.recheckPlacement
      ? false
      : await outsiderOf(actor.accountId, after);
    let unitId: string | null = null;
    const result = await repository.change({
      id: listing.id,
      states: [listing.state],
      version: input.version,
      before: async (tx, locked) => {
        const placed = input.recheckPlacement
          ? await lockPlacement(tx, actor.accountId, after)
          : {
              unitId: after.placement === 'marketplace' ? null : locked.unitId,
              outsider: outsiderWithoutLock,
            };
        unitId = placed.unitId;
        await assertStillPostable(
          tx,
          actor.accountId,
          after.categoryId,
          input.kind === 'resubmit' && listing.categoryId === after.categoryId,
        );
        await trust.assertCanSubmit(tx, {
          accountId: actor.accountId,
          listingId: locked.id,
          kind: input.kind,
          fromState: locked.state,
          outsiderGroupId: placed.outsider ? after.groupId : null,
        });
      },
      data: (locked) => {
        const hideReasons = input.hideReasons(locked.hideReasons);
        const clockColumns = nextClock(
          { ...locked, renewal: input.renewal ?? locked.renewal },
          { state: 'checking', hideReasons },
          now,
          clockSettings(config),
        );
        return {
          ...contentData(after),
          ...keepSystemColumns(listing, after, locked),
          unitId,
          templateVersion,
          state: 'checking',
          version: locked.version + 1,
          fault: null,
          faultReason: null,
          hideReasons,
          restrictions: input.restrictions(locked.restrictions),
          ...clockColumns,
        };
      },
      after: async (tx, updated) => {
        await media.attach(tx, { owner, imageIds: after.imageIds });
        await screening.openRun(tx, { listingId: updated.id, version: updated.version, score });
      },
      submission: {
        kind: input.kind,
        accountId: actor.accountId,
        fromVersion: input.version,
        at: now,
      },
      events: (updated, locked) => [
        listingEvent(LISTING_EVENTS.submitted, {
          listingId: updated.id,
          version: updated.version,
          ownerId: updated.ownerId,
          kind: input.kind,
          deviceHash,
          at: now.toISOString(),
          placement: updated.placement,
          groupId: updated.groupId,
        }),
        stateChangedEvent(updated, locked, input.arrow),
        ...(input.arrow === 'edit'
          ? [
              listingEvent(LISTING_EVENTS.edited, {
                listingId: updated.id,
                version: updated.version,
                machine: true,
              }),
            ]
          : []),
      ],
    });
    return result?.after ?? null;
  };

  return { assertCanPost, assertSubmittable, assertStillPostable, lockPlacement, submit };
}

export type Submission = ReturnType<typeof createSubmission>;
