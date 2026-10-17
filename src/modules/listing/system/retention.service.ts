import type { Prisma } from '@prisma/client';

import { LISTING_EVENTS, listingEvent } from '../listing.outbox.js';
import type { RetentionRow, RetentionRule } from '../listing.ports.js';
import type { ListingShared } from '../listing.shared.js';

export interface ListingRetentionService {
  /** Ứng viên của một luật hạn lưu theo trang — `ops` lọc tạm giữ rồi gọi `purge`. */
  retentionDue(rule: RetentionRule, after: string | null, limit: number): Promise<RetentionRow[]>;
  /**
   * Xoá hẳn: dòng tin (kéo theo lượt gửi, việc đã đóng, ứng viên mẫu) rồi ảnh của tin qua `media` — dòng ảnh xoá cùng
   * `media.images.deleted` nên `screening` dọn dấu ảnh, tệp xoá khỏi kho. Điều kiện của luật kiểm lại lúc xoá. Quyết
   * định, gậy, báo cáo không có khoá ngoại sang tin nên còn nguyên (TK 25). Trả mã đã xoá.
   */
  purge(ids: string[], rule: RetentionRule): Promise<string[]>;
  /** Tài khoản bị xoá hẳn / nhóm đóng quá hạn: xoá mềm mọi tin còn lại — tin đang tạm giữ thì luật tin tự xoá dọn sau. */
  softDeleteWhere(where: { ownerId: string } | { groupId: string }): Promise<string[]>;
  /**
   * Tin hết hạn sắp tới hạn xoá hẳn: nhắc người đăng một lần cho mỗi hạn (`purge_reminded_for`) — gia hạn đổi hạn thì
   * được nhắc lại; lượt bị cắt giữa chừng không nhắc hai lần. Phát `listing.purge.reminder` (N48).
   */
  remindPurge(input: { expiredBefore: Date; retentionMs: number }): Promise<number>;
}

const FAULT_STATES = ['rejected', 'removed'] as const;

/** Điều kiện trên bảng `listings` của từng luật TK 25 — mốc do `ops` đưa, cột do `listing` chọn. */
export function retentionWhere(rule: RetentionRule): Prisma.ListingWhereInput {
  switch (rule.kind) {
    case 'draft':
      return { state: 'draft', deletedAt: null, updatedAt: { lt: rule.updatedBefore } };
    case 'mistake':
      return {
        deletedAt: null,
        updatedAt: { lt: rule.updatedBefore },
        // `fault <> 'violation'` bỏ sót dòng `fault IS NULL` (NULL không so được): liệt kê hai giá trị được phép.
        OR: [
          { state: { in: [...FAULT_STATES] }, fault: 'mistake' },
          {
            hideReasons: { hasSome: ['detached_by_group', 'group_privatized'] },
            OR: [{ fault: null }, { fault: 'mistake' }],
          },
        ],
      };
    case 'violation':
      return { deletedAt: null, state: { in: [...FAULT_STATES] }, fault: 'violation' };
    case 'self_deleted':
      return { deletedAt: { lt: rule.deletedBefore } };
    case 'sold':
      return { state: 'sold', deletedAt: null, updatedAt: { lt: rule.updatedBefore } };
    case 'expired':
      return { state: 'expired', deletedAt: null, expiresAt: { lt: rule.expiredBefore } };
    case 'owner':
      return { ownerId: rule.ownerId, deletedAt: { not: null } };
    case 'group':
      return { groupId: rule.groupId, deletedAt: { not: null } };
  }
}

export function createListingRetentionService(shared: ListingShared): ListingRetentionService {
  const { repository, media, clock } = shared;

  return {
    retentionDue: (rule, after, limit) =>
      repository.retentionDue(retentionWhere(rule), after, limit),

    async purge(ids, rule) {
      const deleted = await repository.purgeWhere(ids, retentionWhere(rule));
      await media.purgeOwners('listing', deleted);
      return deleted;
    },

    softDeleteWhere: (where) => repository.softDeleteWhere(where, clock()),

    remindPurge({ expiredBefore, retentionMs }) {
      return repository.applyBatch({
        where: { state: 'expired', deletedAt: null, expiresAt: { lt: expiredBefore } },
        at: clock(),
        compute: (rows) =>
          rows
            .filter(
              (row) =>
                row.expiresAt !== null &&
                row.purgeRemindedFor?.getTime() !== row.expiresAt.getTime(),
            )
            .map((row) => ({ ...row, purgeRemindedFor: row.expiresAt })),
        events: (changed) =>
          changed.flatMap(({ before }) =>
            before.expiresAt
              ? [
                  listingEvent(LISTING_EVENTS.purgeReminder, {
                    listingId: before.id,
                    ownerId: before.ownerId,
                    purgeAt: new Date(before.expiresAt.getTime() + retentionMs).toISOString(),
                  }),
                ]
              : [],
          ),
      });
    },
  };
}
