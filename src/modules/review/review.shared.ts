import type { PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { Jobs } from '../../lib/jobs.js';
import type { Deadlines } from './calc/task.calc.js';
import type {
  ReviewCategoryPort,
  ReviewGroupPort,
  ReviewIdentityPort,
  ReviewListingPort,
  ReviewMediaPort,
  ReviewPlatformPort,
  ReviewScreeningPort,
  ReviewTrustPort,
} from './review.ports.js';
import type { ReviewRepository } from './review.repository.js';

const DAY_MS = 86_400_000;

export interface ReviewServiceDeps {
  repository: ReviewRepository;
  listings: ReviewListingPort;
  screening: ReviewScreeningPort;
  identity: ReviewIdentityPort;
  trust: ReviewTrustPort;
  groups: ReviewGroupPort;
  platform: ReviewPlatformPort;
  categories: ReviewCategoryPort;
  media: ReviewMediaPort;
  /** Quyền staff của người đang hỏi — đọc lại mỗi lượt, không tin vai trong token (quyền bị treo có hiệu lực ngay). */
  privileges: PrivilegeSource;
  jobs: Jobs;
  config: RuntimeConfig;
  clock: () => Date;
  /** Lượt quay lấy mẫu trong [0, 100) — test tiêm để chắc chắn trúng hay trượt. */
  random?: () => number;
}

// ── LỖI ──────────────────────────────────────────────────────────────────────────────────────────

/** Việc ngoài phạm vi của người hỏi trả 404 như việc không tồn tại — không lộ việc của danh mục, nhóm khác. */
export const taskNotFound = (): NotFoundError => new NotFoundError('Không có việc này');
export const taskClaimed = (): ConflictError =>
  new ConflictError('Việc đang có người khác xử', 'TASK_CLAIMED');
export const taskNotClaimed = (): ConflictError =>
  new ConflictError(
    'Bạn chưa nhận việc này, hoặc đã hết 10 phút giữ — nhận lại rồi quyết',
    'TASK_NOT_CLAIMED',
  );
export const taskClosed = (): ConflictError =>
  new ConflictError('Việc đã đóng — đã có quyết định hoặc đã bị huỷ', 'TASK_CLOSED');
export const taskReassigned = (): ConflictError =>
  new ConflictError(
    'Việc đã chuyển cho người khác xử (quá hạn hoặc thêm lý do mới) — không có gì thay đổi',
    'TASK_REASSIGNED',
  );
export const taskOpen = (): ConflictError =>
  new ConflictError('Tin đang có việc chờ xử — quyết qua việc đó', 'TASK_OPEN');
export const listingChanged = (): ConflictError =>
  new ConflictError('Người đăng vừa sửa tin — tải lại rồi nhận lại việc', 'LISTING_CHANGED');
export const outcomeNotAllowed = (message: string): ConflictError =>
  new ConflictError(message, 'OUTCOME_NOT_ALLOWED');

// ── DÙNG CHUNG ───────────────────────────────────────────────────────────────────────────────────

export function createReviewShared(deps: ReviewServiceDeps) {
  const { identity, config, clock } = deps;

  const deadlines = (): Deadlines => ({
    machineHoldHours: config.get('review.machineHoldHours'),
    machineRestrictionHours: config.get('review.machineRestrictionHours'),
    groupEscalationHours: config.get('review.groupEscalationHours'),
    sampleDays: config.get('review.sampleDays'),
  });

  /**
   * Những người này cùng mọi tài khoản đã đăng tin từ cùng máy với họ trong toàn bộ dữ liệu thiết bị còn giữ (180 ngày,
   * chốt 15/10/2026) — không ai trong số đó được xử việc của nhau (TK 8, 16).
   */
  const withSharedDevices = async (accountIds: readonly string[]): Promise<string[]> => {
    const since = new Date(clock().getTime() - config.get('device.dataRetentionDays') * DAY_MS);
    const shared = await Promise.all(
      [...new Set(accountIds)].map((id) => identity.sharedDeviceAccounts(id, since)),
    );
    return [...new Set([...accountIds, ...shared.flat()])];
  };

  return {
    ...deps,
    random: deps.random ?? (() => Math.random() * 100),
    deadlines,
    withSharedDevices,
  };
}

export type ReviewShared = ReturnType<typeof createReviewShared>;
