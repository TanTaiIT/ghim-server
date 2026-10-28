import type { PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { DayCount } from '../../common/time/time.js';
import type {
  ListingFault,
  ListingHideReason,
  ListingPlacement,
  ListingRestriction,
  ListingState,
  ListingSubmissionKind,
  Prisma,
} from '@prisma/client';

import type { CategoryService } from '../category/category.service.js';
import type { GroupService } from '../group/group.service.js';
import type { MediaService } from '../media/media.service.js';
import type { RegionService } from '../region/region.service.js';
import type { PostingFee } from './calc/fee.calc.js';

/*
 * Hợp đồng của `listing` với module khác (CLAUDE.md luật 12): `trust`, `screening` cài các cổng này, `app.ts` nối vào,
 * và đọc dữ kiện tin qua `ListingFactsService`; module khác import kiểu từ đây chứ không từ `listing.shared.ts` hay
 * một cụm (`read/`, `posting/`) — đó là phần NỘI BỘ của `listing`.
 */

export type TrustTier = 'T0' | 'T1' | 'T2' | 'T3';
type Tx = Prisma.TransactionClient;

/** Chỗ cắm mức tin cậy: hạn mức lúc gửi (luật 12) và điểm gậy lúc lên bảng; `tierOf` còn là chỗ `app.ts` nối mức cho các module khác. */
export interface ListingTrustPort {
  tierOf(accountId: string): Promise<TrustTier>;
  /** Điểm gậy đọc trong transaction lên bảng — lý do hạn chế "gậy" (add-strikes). */
  strikePointsIn(tx: Tx, accountId: string): Promise<number>;
  strikePointsOf(accountId: string): Promise<number>;
  /** Trong các tài khoản, ai đang có gậy hiệu lực — tin hiện lại sau tạm ẩn mang lý do "gậy" (add-strikes). */
  struckAccounts(accountIds: string[]): Promise<Set<string>>;
  /** Hạn mức, nhịp gửi — trong transaction gửi; ném lỗi của `trust` thì cả lượt quay lui. */
  assertCanSubmit(
    tx: Tx,
    input: {
      accountId: string;
      listingId: string;
      kind: ListingSubmissionKind;
      /** Trạng thái trước lượt gửi: gửi lại tin bị từ chối / bị gỡ chiếm thêm chỗ, sửa tin đang hiện thì không. */
      fromState: ListingState;
      /** Nhóm đích khi người gửi là người ngoài (trần riêng mỗi nhóm); thành viên hay sàn chung thì `null`. */
      outsiderGroupId: string | null;
    },
  ): Promise<void>;
}

/** Bản đang gửi đưa cho máy chấm — nội dung của lượt gửi, chưa phải dòng đã lưu (design add-screening mục 1). */
export interface ScreeningSubmission {
  listingId: string;
  accountId: string;
  kind: ListingSubmissionKind;
  deviceHash: string;
  title: string;
  description: string | null;
  price: bigint | null;
  categoryId: string;
  placement: ListingPlacement;
  imageIds: string[];
  /** Nhóm của tin bật duyệt tay và lượt này là gửi mới hay gửi lại: máy cho qua vẫn giữ cho người (add-group-manual-review). */
  groupManual: boolean;
}

/** Câu báo của máy cho người đăng (spec screening/explanations) — `screening` soạn, `listing` chỉ hiện. */
export interface MachineNotice {
  kind: 'plain' | 'fraud' | 'limited';
  message: string;
  estimatedWait: string | null;
  lookupCode: string | null;
  fixes: { code: string; message: string }[];
}

/**
 * Chỗ cắm máy duyệt (design mục 8): thời gian chờ, chấm chữ trước transaction, ghi lượt chấm trong transaction. Kết quả
 * chấm `listing` chỉ chuyển từ `scoreText` sang `openRun` của cùng lượt gửi, không đọc.
 */
export interface ListingScreeningPort {
  /** Ném 429 `SUBMISSION_COOLDOWN` khi đang trong thời gian chờ và lượt là tin mới — gửi nháp, chuyển lên sàn. */
  precheck(accountId: string, kind: ListingSubmissionKind): Promise<void>;
  /** Chấm chữ trước transaction; lỗi dịch vụ không ném ra (máy không phạt — lưới an toàn giữ cho người). */
  scoreText(input: ScreeningSubmission): Promise<unknown>;
  openRun(tx: Tx, input: { listingId: string; version: number; score: unknown }): Promise<void>;
  /**
   * Câu của lượt máy kết luận gần nhất mỗi tin; tin không có câu thì vắng khỏi map. Áp kết quả máy làm tăng `version`
   * của tin, nên hỏi theo tin chứ không theo phiên bản — trạng thái tin quyết định câu còn hiện hay không.
   */
  notices(listingIds: string[]): Promise<Map<string, MachineNotice>>;
}

/** Việc đang chờ của người duyệt, báo cáo, hậu kiểm khoá nơi đăng (cam kết 19) — `review` cài (`blocksPlacement`). */
export interface OpenWork {
  blocksPlacement(listingId: string): Promise<boolean>;
  /** Tin đang có báo cáo mở đã tự ẩn vì nhiều người báo (add-reports) — bên nghe đối chiếu cờ `reported` theo đây. */
  reportHidden(listingId: string): Promise<boolean>;
}

export type ListingGroupPort = Pick<
  GroupService,
  | 'lockForPosting'
  | 'membersAmong'
  | 'memberGroupIds'
  | 'badgeHolders'
  | 'badgeLabels'
  | 'canRemoveBadge'
  | 'completePrivatization'
  | 'findGroup'
  | 'isBanned'
  | 'memberUnit'
  | 'reviewersOf'
>;
/** Quyền staff đọc lại mỗi lượt đẩy tin (add-admin-boost), như bàn vận hành — không tin token. */
export type ListingPrivilegePort = Pick<PrivilegeSource, 'staffGrant'>;
export type ListingCategoryPort = Pick<
  CategoryService,
  'statusOf' | 'lockStatus' | 'validateAttributes' | 'currentTemplate'
>;
/** Cặp tỉnh / phường của tin phải có thật — `region` tách khỏi `category` 24/10/2026. */
export type ListingRegionPort = Pick<RegionService, 'validateRegion'>;
export type ListingMediaPort = Pick<
  MediaService,
  'resolve' | 'attach' | 'viewUrl' | 'copyImages' | 'purgeOwners'
>;

/**
 * Luật hạn lưu của TK 25 mà `ops` áp lên tin (add-data-retention). Mốc do `ops` tính từ bảng con số; `listing` chỉ dịch
 * mỗi luật thành điều kiện trên bảng của mình, và kiểm lại điều kiện đó lúc xoá.
 */
export type RetentionRule =
  | { kind: 'draft'; updatedBefore: Date }
  /** Từ chối / gỡ vì sai sót, hay đã rời nhóm hẳn vì bị gỡ khỏi nhóm / nhóm sang riêng tư — không được sửa từ mốc. */
  | { kind: 'mistake'; updatedBefore: Date }
  /** Từ chối / gỡ vì vi phạm — mốc theo gậy, `ops` chọn mã rồi mới gọi xoá. */
  | { kind: 'violation' }
  | { kind: 'self_deleted'; deletedBefore: Date }
  | { kind: 'sold'; updatedBefore: Date }
  | { kind: 'expired'; expiredBefore: Date }
  /** Tin đã xoá mềm của một tài khoản bị xoá hẳn / một nhóm đóng quá hạn. */
  | { kind: 'owner'; ownerId: string }
  | { kind: 'group'; groupId: string };

export interface RetentionRow {
  id: string;
  ownerId: string;
  groupId: string | null;
  updatedAt: Date;
}

/** Một lượt rời nhóm như `group.member.left` mang theo — đủ để biết tin nào của người đó bị ẩn (C8). */
export interface GroupLeave {
  reason: 'left' | 'removed' | 'banned' | 'account_deleted';
  /** Công tắc "nhận tin người ngoài" đúng lúc rời. */
  allowOutsiders: boolean;
}

/** Dữ kiện của một tin để `review` định tuyến việc và kiểm quyết định (design add-review-queues mục 8). */
export interface ReviewSubject {
  id: string;
  ownerId: string;
  state: ListingState;
  version: number;
  placement: ListingPlacement | null;
  groupId: string | null;
  unitId: string | null;
  categoryId: string | null;
  restrictions: ListingRestriction[];
  /** Tin đã rời nhóm hẳn (nhóm đóng, gỡ khỏi nhóm…) — không còn gì để điều hành nhóm xử. */
  detached: boolean;
  /** Lý do tạm ẩn: tin đang ẩn không bị lấy mẫu, tin của tài khoản đã xoá không sinh việc (fix-audit-review, T7). */
  hideReasons: ListingHideReason[];
  /** Người đăng đã xoá tin — chỉ có khi hỏi kèm `includeDeleted`: báo cáo xử trên bản lưu (add-reports). */
  deleted: boolean;
}

/** Tin người báo cáo đang nhắm tới, khi người đó thấy được nó (add-reports). */
export interface ReportTarget {
  id: string;
  ownerId: string;
  state: ListingState;
  placement: ListingPlacement | null;
  /** Đang hiện với người khác: chỉ tin sàn chung đang hiện mới tự ẩn khi nhiều người báo. */
  visible: boolean;
}

/**
 * Thẻ tin đầu một hội thoại và dữ kiện của luật trả giá (add-price-offers). Tin đã xoá: chỉ còn `deleted`. Tin bị gỡ không
 * kèm ảnh bìa — ảnh của tin vi phạm không đi tiếp qua đường hội thoại.
 */
export interface ConversationCard {
  title: string | null;
  price: bigint | null;
  negotiable: boolean;
  state: ListingState;
  /** Đang hiện với người khác: đang hiển thị và không tạm ẩn. */
  visible: boolean;
  deleted: boolean;
  cover: { id: string; url: string } | null;
}

/** Dòng tin `review` đang giữ khoá trong lượt ghi việc: phiên bản và trạng thái tại lúc đó (fix-audit-review, T5). */
export interface ListingLock {
  version: number;
  state: ListingState;
}

export interface QuotaFacts {
  live: number;
  submittedAt: Date[];
  liveInGroup: number | null;
}

export interface ListingSummary {
  id: string;
  title: string | null;
  state: ListingState;
}

export interface LiveListingFacts {
  id: string;
  version: number;
  ownerId: string;
  text: string;
  imageIds: string[];
}

/**
 * Dữ kiện `listing` lộ cho `trust` (design add-trust-tiers mục 5, 6, 9) và `screening` (design add-screening mục 12):
 * hai module không đọc bảng `listings`, chỉ hỏi qua đây. Không cổng nào ghi gì. Cài ở `read/facts.service.ts`.
 */
export interface ListingFactsService {
  /** `tx` của lượt gửi khi kiểm hạn mức; `null` khi chỉ đọc (bảng uy tín). */
  quotaFacts(
    tx: Tx | null,
    input: { accountId: string; since: Date; groupId: string | null },
  ): Promise<QuotaFacts>;
  occupying(tx: Tx, accountId: string): Promise<ListingSummary[]>;
  dashboardFacts(accountId: string): Promise<{
    restricted: (ListingSummary & { restrictions: ListingRestriction[] })[];
    pending: ListingSummary[];
  }>;
  shownCandidates(input: {
    minShownMs: number;
    since: Date;
    now: Date;
  }): Promise<{ listingId: string; ownerId: string }[]>;
  /** Tổng thời gian tin đã được thấy tới `now` — lối "đã bán" cần đủ số ngày; `null` khi không có tin này. */
  shownMs(listingId: string, now: Date): Promise<number | null>;
  /** Phí một lượt đăng tin cho bảng uy tín (TK 29): hiện 0 Xu (prepare-promotions). */
  postingFee(): PostingFee;
  /** Trạng thái hiện tại của tin (kể cả tin đã xoá mềm) — `trust` đối chiếu cặp mất / có lại tư cách tin sạch. */
  stateOf(listingId: string): Promise<{ state: ListingState; fault: ListingFault | null } | null>;
  /**
   * Huỷ gậy nghiêm trọng trả lại số ngày hiển thị đã trôi trong lúc khoá (spec display-period, add-strikes): cộng `ms` vào
   * hạn của tin đang `live` của người đó, trong transaction quyết định của `trust`.
   */
  compensateLockedDays(tx: Tx, input: { accountId: string; ms: number }): Promise<number>;
  ownTexts(input: {
    accountId: string;
    since: Date;
    excludeId: string;
  }): Promise<{ id: string; text: string }[]>;
  countSubmissions(accountId: string, since: Date): Promise<number>;
  priceSamples(categoryId: string, since: Date): Promise<bigint[]>;
  liveListings(after: string | null, take: number): Promise<LiveListingFacts[]>;
  /** Cổng cho `ops`: tin lên bảng lần đầu theo ngày Việt Nam, nửa mở `[from, to)` (add-ops-daily-stats). */
  firstLiveByDay(from: Date, to: Date): Promise<DayCount[]>;
}
