import type {
  ListingPlacement,
  ListingRestriction,
  ListingState,
  ListingSubmissionKind,
  Prisma,
} from '@prisma/client';

import type { CategoryService } from '../category/category.service.js';
import type { GroupService } from '../group/group.service.js';
import type { MediaService } from '../media/media.service.js';

/*
 * Hợp đồng của `listing` với module khác (CLAUDE.md luật 12): `trust`, `screening` cài các cổng này, `app.ts` nối vào,
 * và đọc dữ kiện tin qua `ListingFactsService`; module khác import kiểu từ đây chứ không từ `listing.shared.ts` hay
 * một cụm (`read/`, `posting/`) — đó là phần NỘI BỘ của `listing`.
 */

export type TrustTier = 'T0' | 'T1' | 'T2' | 'T3';
type Tx = Prisma.TransactionClient;

/** Chỗ cắm mức tin cậy (design mục 7): hai lời gọi đồng bộ của luật 12. */
export interface ListingTrustPort {
  tierOf(accountId: string): Promise<TrustTier>;
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

/** Việc đang chờ của người duyệt, báo cáo, hậu kiểm khoá nơi đăng (cam kết 19) — `add-review-queues` nối. */
export interface OpenWork {
  blocksPlacement(listingId: string): Promise<boolean>;
}

/** Chưa có hàng đợi duyệt, báo cáo hay hậu kiểm nên không việc nào khoá nơi đăng — `add-review-queues` thay. */
export const noOpenWork: OpenWork = {
  blocksPlacement: () => Promise.resolve(false),
};

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
>;
export type ListingCategoryPort = Pick<
  CategoryService,
  'statusOf' | 'validateRegion' | 'validateAttributes'
>;
export type ListingMediaPort = Pick<MediaService, 'resolve' | 'attach' | 'viewUrl' | 'copyImages'>;

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
  ownTexts(input: {
    accountId: string;
    since: Date;
    excludeId: string;
  }): Promise<{ id: string; text: string }[]>;
  countSubmissions(accountId: string, since: Date): Promise<number>;
  priceSamples(categoryId: string, since: Date): Promise<bigint[]>;
  liveListings(after: string | null, take: number): Promise<LiveListingFacts[]>;
}
