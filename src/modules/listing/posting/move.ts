import { Prisma, type ListingState } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { ConflictError } from '../../../common/errors/app-error.js';
import { DAY_MS } from '../display-period.calc.js';
import { isDetached } from '../hide.calc.js';
import { LISTING_EVENTS, listingEvent } from '../listing.outbox.js';
import type { OwnListingDto } from '../listing.schema.js';
import { invalidTransition, type ListingShared } from '../listing.shared.js';
import {
  contentData,
  fieldsOf,
  type ListingFields,
  screeningInput,
  type Submission,
} from './submission.js';

const NOT_MOVABLE: ReadonlySet<ListingState> = new Set(['draft', 'sold', 'rejected', 'removed']);
const alreadyMoved = (): ConflictError =>
  new ConflictError('Tin này đã được chuyển lên sàn chung', 'ALREADY_MOVED');

/** Lỗi Prisma "trùng khoá" — `moved_from_listing_id` là chỗ duy nhất của `listing` dùng tới. */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Tin đã rời nhóm hẳn thành một tin MỚI ở sàn chung (design mục 13): chép nội dung và ảnh, không chép huy hiệu, đi
 * bước 3–7 của lượt gửi với `kind = move`. Tin cũ không đổi; unique `moved_from_listing_id` chặn lượt thứ hai.
 */
export function createMoveToMarketplace(shared: ListingShared, submission: Submission) {
  const { repository, media, trust, screening, config, clock, ownedBy, toOwnDto } = shared;

  return async (
    actor: Actor,
    id: string,
    body: { provinceCode?: number | undefined; wardCode?: number | undefined },
    deviceId: string | null,
  ): Promise<OwnListingDto> => {
    const old = await ownedBy(actor, id);
    if (!isDetached(old.hideReasons) || !old.leftGroupAt) {
      throw invalidTransition('Chỉ chuyển lên sàn chung được tin đã rời nhóm hẳn');
    }
    // Đã bán thì không còn gì để bán; bị từ chối / bị gỡ mà chuyển đi là thoát quyết định của người duyệt (D8).
    if (NOT_MOVABLE.has(old.state))
      throw invalidTransition('Tin này không chuyển lên sàn chung được');
    const now = clock();
    const days = config.get('listing.moveToMarketplaceDays');
    if (now.getTime() > old.leftGroupAt.getTime() + days * DAY_MS) {
      throw new ConflictError(
        `Đã quá ${days} ngày kể từ khi tin rời nhóm, không chuyển lên sàn chung được nữa`,
        'MOVE_WINDOW_EXPIRED',
      );
    }
    if (await repository.movedFrom(id)) throw alreadyMoved();
    const after: ListingFields = {
      ...fieldsOf(old),
      placement: 'marketplace',
      groupId: null,
      badgeGroupId: null,
      provinceCode: body.provinceCode ?? old.provinceCode,
      wardCode: body.wardCode ?? old.wardCode,
    };
    const deviceHash = await submission.assertCanPost(actor, deviceId, 'move');
    const templateVersion = await submission.assertSubmittable(old, after);
    const newId = await repository.newId();
    const copy = await media.copyImages({
      from: { kind: 'listing', id: old.id },
      to: { kind: 'listing', id: newId },
      imageIds: old.imageIds,
      uploaderId: actor.accountId,
    });
    const score = await screening.scoreText(
      screeningInput({
        listingId: newId,
        actor,
        kind: 'move',
        deviceHash,
        after: { ...after, imageIds: copy.imageIds },
      }),
    );
    try {
      const created = await repository.createMoved({
        data: {
          id: newId,
          ownerId: actor.accountId,
          ...contentData({ ...after, imageIds: copy.imageIds }),
          templateVersion,
          state: 'checking',
          movedFromListingId: old.id,
        },
        before: (tx) =>
          trust.assertCanSubmit(tx, {
            accountId: actor.accountId,
            listingId: newId,
            kind: 'move',
            fromState: old.state,
            outsiderGroupId: null,
          }),
        after: async (tx, row) => {
          await copy.commit(tx);
          await screening.openRun(tx, { listingId: row.id, version: row.version, score });
        },
        submission: { kind: 'move', accountId: actor.accountId, at: now },
        events: (row) => [
          listingEvent(LISTING_EVENTS.submitted, {
            listingId: row.id,
            version: row.version,
            ownerId: row.ownerId,
            kind: 'move',
            deviceHash,
            at: now.toISOString(),
            placement: row.placement,
            groupId: null,
          }),
          listingEvent(LISTING_EVENTS.moved, {
            fromListingId: old.id,
            toListingId: row.id,
            ownerId: row.ownerId,
          }),
        ],
      });
      return toOwnDto(created, clock());
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyMoved();
      throw error;
    }
  };
}
