import type { Listing, ListingPlacement, ListingRestriction, ListingState } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import {
  type AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import { type ClockSettings, DAY_MS, remainingMs } from './calc/display-period.calc.js';
import { isDetached } from './calc/hide.calc.js';
import type {
  ListingCategoryPort,
  ListingGroupPort,
  ListingMediaPort,
  ListingScreeningPort,
  ListingTrustPort,
  MachineNotice,
  OpenWork,
} from './listing.ports.js';
import type { ListingRepository, Tx } from './listing.repository.js';
import type { ListingDto, OwnListingDto } from './listing.schema.js';
import type { PlacementBlock } from './calc/placement.calc.js';
import { canView, type Viewer } from './calc/visibility.calc.js';

/** Máy giữ thì câu nằm trên tin chờ duyệt; cho hiện hạn chế thì câu chỉ còn ý nghĩa khi tin còn bị hạn chế. */
const showsNotice = (row: Listing, notice: MachineNotice): boolean =>
  notice.kind === 'limited'
    ? row.state === 'live' && row.restrictions.length > 0
    : row.state === 'pending';

export interface ListingServiceDeps {
  repository: ListingRepository;
  groups: ListingGroupPort;
  categories: ListingCategoryPort;
  media: ListingMediaPort;
  identity: {
    deviceToken(deviceId: string): string;
    /** Trạng thái hiện tại của tài khoản — bên nghe khoá / mở khoá đối chiếu (fix-audit-listeners). */
    accountState(accountId: string): Promise<{ status: string } | null>;
    /** Trong transaction của lượt gửi: `FOR SHARE` dòng tài khoản, trả trạng thái (fix-audit-listing, T15). */
    lockAccountStatus(tx: Tx, accountId: string): Promise<string | null>;
  };
  trust: ListingTrustPort;
  screening: ListingScreeningPort;
  openWork: OpenWork;
  config: RuntimeConfig;
  clock: () => Date;
}

// ── LỖI ──────────────────────────────────────────────────────────────────────────────────────────

export const listingNotFound = (): NotFoundError => new NotFoundError('Không có tin này');
export const invalidTransition = (
  message = 'Tin đang ở trạng thái không làm được việc này',
): ConflictError => new ConflictError(message, 'INVALID_TRANSITION');
export const versionConflict = (): ConflictError =>
  new ConflictError('Tin vừa được sửa ở nơi khác — tải lại rồi thử lại', 'CONFLICT');
/** Tin đã rời nhóm hẳn chỉ chuyển lên sàn chung hay xoá được (spec editing) — mọi đường ghi khác dùng chung câu này. */
/** Tin bị từ chối / gỡ vì vi phạm là hồ sơ của gậy: không sửa gửi lại, không tự xoá (TK 17, add-strikes). */
export const listingUnderViolation = (): ConflictError =>
  new ConflictError(
    'Tin bị xử vì vi phạm — chỉ khiếu nại được, không sửa để gửi lại',
    'LISTING_UNDER_VIOLATION',
  );
export const listingDeleteBlocked = (): ConflictError =>
  new ConflictError(
    'Tin bị gỡ vì vi phạm là hồ sơ của cảnh cáo — chưa xoá được',
    'LISTING_DELETE_BLOCKED',
  );

export const listingDetached = (): ConflictError =>
  new ConflictError(
    'Tin đã rời nhóm hẳn — chỉ chuyển lên sàn chung hoặc xoá được',
    'LISTING_DETACHED',
  );
/** Nơi đăng không đổi khi tin đang có việc chờ (spec editing) — sửa và gia hạn dùng chung. */
export const placementLocked = (): ConflictError =>
  new ConflictError('Tin đang có việc chờ xử, chưa đổi nơi đăng được', 'PLACEMENT_LOCKED');

const PLACEMENT_MESSAGES: Record<PlacementBlock, { status: 403 | 409; message: string }> = {
  GROUP_LOCKED: { status: 409, message: 'Nhóm đang tạm khoá, chưa nhận tin mới' },
  GROUP_CLOSED: { status: 409, message: 'Nhóm đã đóng' },
  GROUP_MODE_CHANGING: {
    status: 409,
    message: 'Nhóm đang chuyển sang riêng tư — chưa đăng được mức "nhóm công khai"',
  },
  GROUP_BANNED: { status: 403, message: 'Bạn đã bị cấm khỏi nhóm này' },
  NOT_GROUP_MEMBER: { status: 403, message: 'Mức "chỉ thành viên" chỉ dành cho thành viên nhóm' },
  PLACEMENT_NOT_ALLOWED: { status: 409, message: 'Nhóm riêng tư không có mức "nhóm công khai"' },
  OUTSIDER_POSTS_DISABLED: { status: 403, message: 'Nhóm này đang không nhận tin của người ngoài' },
};

export function placementError(code: PlacementBlock): AppError {
  const { status, message } = PLACEMENT_MESSAGES[code];
  return status === 403 ? new ForbiddenError(message, code) : new ConflictError(message, code);
}

export const validationError = (message: string): BadRequestError =>
  new BadRequestError(message, 'VALIDATION_ERROR');

// ── CHUNG ────────────────────────────────────────────────────────────────────────────────────────

export const clockSettings = (config: RuntimeConfig): ClockSettings => ({
  visibleDays: config.get('listing.visibleDays'),
  renewExtendDays: config.get('listing.renewExtendDays'),
});

const RESTRICTION_ORDER: readonly ListingRestriction[] = [
  'machine',
  'new_account',
  'strike',
  'strike_wave',
];

/** Đặt hay gỡ một lý do hạn chế, giữ thứ tự cố định để chạy lại ra cùng một mảng. */
export function withRestriction(
  current: readonly ListingRestriction[],
  reason: ListingRestriction,
  present: boolean,
): ListingRestriction[] {
  const set = new Set(current);
  if (present) set.add(reason);
  else set.delete(reason);
  return RESTRICTION_ORDER.filter((item) => set.has(item));
}

export const isPublicPlacement = (placement: ListingPlacement | null): boolean =>
  placement === 'marketplace' || placement === 'group_public';

/** Người khác đi mũi tên của người đăng: thấy được tin → 403, không thấy → 404 như tin không tồn tại (design mục 3). */
export function forbiddenOrMissing(listing: Listing, viewer: Viewer): AppError {
  return canView(listing, viewer, 'link')
    ? new ForbiddenError('Đây không phải tin của bạn')
    : listingNotFound();
}

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error('Thiếu DTO của tin');
  return row;
}

export function createListingShared(deps: ListingServiceDeps) {
  const { repository, groups, media, config } = deps;

  /** Người xem như luật "ai thấy một tin" cần: nhóm người đó đang là thành viên (chỉ nhóm của tin là đủ). */
  const viewerFor = async (actor: Actor | null, groupId: string | null): Promise<Viewer> => {
    if (!actor) return { accountId: null, memberGroupIds: new Set() };
    const member =
      groupId !== null &&
      (await groups.membersAmong(groupId, [actor.accountId])).has(actor.accountId);
    return {
      accountId: actor.accountId,
      memberGroupIds: new Set(member && groupId ? [groupId] : []),
    };
  };

  /** Tin của chính người gọi; người khác → 403 hay 404 tuỳ có thấy tin không, tin đã xoá → 404. */
  const ownedBy = async (actor: Actor, id: string): Promise<Listing> => {
    const listing = await repository.findById(id);
    if (!listing || listing.deletedAt !== null) throw listingNotFound();
    if (listing.ownerId !== actor.accountId) {
      throw forbiddenOrMissing(listing, await viewerFor(actor, listing.groupId));
    }
    return listing;
  };

  const imagesOf = (listing: Listing) =>
    Promise.all(listing.imageIds.map(async (id) => ({ id, url: await media.viewUrl(id) })));

  const toDtos = async (rows: Listing[]): Promise<ListingDto[]> => {
    const labels = await groups.badgeLabels(
      rows.flatMap((row) => (row.badgeGroupId ? [row.badgeGroupId] : [])),
    );
    return Promise.all(
      rows.map(async (row) => {
        const label = row.badgeGroupId ? labels.get(row.badgeGroupId) : undefined;
        return {
          id: row.id,
          ownerId: row.ownerId,
          state: row.state,
          placement: row.placement,
          groupId: row.groupId,
          title: row.title,
          description: row.description,
          price: row.price,
          negotiable: row.negotiable,
          delivery: row.delivery,
          showPhone: row.showPhone,
          categoryId: row.categoryId,
          templateVersion: row.templateVersion,
          attributes: (row.attributes ?? {}) as Record<string, unknown>,
          provinceCode: row.provinceCode,
          wardCode: row.wardCode,
          images: await imagesOf(row),
          // Nhóm tạm khoá thì huy hiệu ẩn lúc đọc, không lưu gì — mở khoá là hiện lại trên đúng các tin cũ.
          badge:
            row.badgeGroupId && label && !label.locked
              ? { groupId: row.badgeGroupId, name: label.name }
              : null,
          firstLiveAt: row.firstLiveAt?.toISOString() ?? null,
          featuredUntil: row.featuredUntil?.toISOString() ?? null,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
    );
  };

  const moveUntil = (row: Listing): string | null => {
    if (!row.leftGroupAt || !isDetached(row.hideReasons)) return null;
    const days = config.get('listing.moveToMarketplaceDays');
    return new Date(row.leftGroupAt.getTime() + days * DAY_MS).toISOString();
  };

  const toOwnDtos = async (rows: Listing[], now: Date): Promise<OwnListingDto[]> => {
    const [base, notices] = await Promise.all([
      toDtos(rows),
      deps.screening.notices(
        rows.filter((row) => row.state === 'pending' || row.state === 'live').map((row) => row.id),
      ),
    ]);
    return rows.map((row, index) => {
      const dto = base[index];
      if (!dto) throw new Error('Thiếu DTO của tin');
      const notice = notices.get(row.id);
      return {
        ...dto,
        version: row.version,
        unitId: row.unitId,
        badgeGroupId: row.badgeGroupId,
        hideReasons: row.hideReasons,
        restrictions: row.restrictions,
        remainingMs: row.expiresAt ? null : remainingMs(row, now),
        renewal: row.renewal,
        fault: row.fault,
        faultReason: row.faultReason,
        moveUntil: moveUntil(row),
        machineNotice: notice && showsNotice(row, notice) ? notice : null,
      };
    });
  };

  /** Ghi có điều kiện trượt: tin đã xoá → 404, phiên bản lệch → 409 `CONFLICT`, còn lại là sai trạng thái. */
  const explainMiss = async (id: string, version: number): Promise<never> => {
    const fresh = await repository.findById(id);
    if (!fresh || fresh.deletedAt !== null) throw listingNotFound();
    if (fresh.version !== version) throw versionConflict();
    throw invalidTransition();
  };

  return {
    ...deps,
    viewerFor,
    ownedBy,
    explainMiss,
    toDtos,
    toOwnDtos,
    toDto: (row: Listing) => one(toDtos([row])),
    toOwnDto: (row: Listing, now: Date) => one(toOwnDtos([row], now)),
  };
}

export type ListingShared = ReturnType<typeof createListingShared>;

/** Trạng thái tin của người đăng sửa được nội dung (mũi tên "sửa" của TK 18). */
export const EDITABLE_STATES: readonly ListingState[] = ['pending', 'live', 'rejected', 'removed'];
