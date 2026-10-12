import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import type { ListingFactsService } from '../listing/listing.facts.service.js';
import type { QuotaSettings } from './quota.calc.js';
import type { TierSettings, TrustTier } from './tier.calc.js';
import type { TrustRepository } from './trust.repository.js';

/** Dữ kiện tin đăng `trust` cần — `listing` trả lời, `trust` không đọc bảng `listings` (design mục 1, luật 12). */
export type TrustListingPort = Pick<
  ListingFactsService,
  'quotaFacts' | 'occupying' | 'dashboardFacts' | 'shownCandidates' | 'shownMs'
>;

/** Tuổi tài khoản tính từ lúc tạo (câu 6) — `identity` trả lời; tài khoản đã xoá thì không tính lại. */
export interface TrustIdentityPort {
  accountSummaries(ids: string[]): Promise<Map<string, { status: string; createdAt: Date }>>;
}

/**
 * "Có người khác nhắn hỏi mua" — điều kiện của lối tin sạch "đã bán" (TK 20). `add-messaging` nối, kèm luật không tính
 * tài khoản dùng chung máy với người bán (câu 5); tới đó luôn sai, nên mức chỉ lên bằng lối hiện đủ ngày (proposal).
 */
export interface BuyerInterest {
  hasInquiry(listingId: string): Promise<boolean>;
}

export interface HoldNotice {
  reason: string;
  /** Thời gian chờ ước tính — có ở câu chung ba phần của tin giữ vì dấu hiệu gian lận (`add-screening`). */
  estimatedWait: string | null;
  /** Mã tra cứu để hỗ trợ xem lý do cụ thể — cũng của `add-screening`. */
  lookupCode: string | null;
}

/**
 * Câu cho tin đang chờ người duyệt trên bảng uy tín (spec seller-dashboard): tin giữ vì dấu hiệu gian lận nhận câu chung
 * ba phần, không nêu tín hiệu nào — chỉ `screening` biết tin bị giữ vì sao, nên câu do nó cấp (design mục 9).
 */
export interface HoldExplanation {
  explain(listingIds: string[]): Promise<Map<string, HoldNotice>>;
}

export interface TrustServiceDeps {
  repository: TrustRepository;
  listings: TrustListingPort;
  identity: TrustIdentityPort;
  buyerInterest: BuyerInterest;
  holds: HoldExplanation;
  config: RuntimeConfig;
  clock: () => Date;
}

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const tierSettings = (config: RuntimeConfig): TierSettings => ({
  minDays: {
    T1: config.get('trust.t1MinDays'),
    T2: config.get('trust.t2MinDays'),
    T3: config.get('trust.t3MinDays'),
  },
  minClean: {
    T1: config.get('trust.t1MinCleanListings'),
    T2: config.get('trust.t2MinCleanListings'),
    T3: config.get('trust.t3MinCleanListings'),
  },
  maxCleanPer7Days: config.get('trust.maxCleanPer7Days'),
});

export const quotaSettings = (config: RuntimeConfig, tier: TrustTier): QuotaSettings => ({
  liveCap: config.get(`quota.liveListings${tier}`),
  perHour: config.get(`quota.submitsPerHour${tier}`),
  outsiderPerGroup: config.get('quota.outsiderLiveListingsPerGroup'),
});

/** Bản tạm tới `add-messaging`: chưa có tin nhắn thì chưa ai hỏi mua. */
export const noBuyerInterest: BuyerInterest = {
  hasInquiry: () => Promise.resolve(false),
};

const WAITING_FOR_REVIEWER: HoldNotice = {
  reason: 'Đang chờ người duyệt',
  estimatedWait: null,
  lookupCode: null,
};

/** Bản tạm tới `add-screening`: mọi tin chờ duyệt nhận câu "đang chờ người duyệt". */
export const genericHolds: HoldExplanation = {
  explain: (ids) => Promise.resolve(new Map(ids.map((id) => [id, WAITING_FOR_REVIEWER]))),
};
