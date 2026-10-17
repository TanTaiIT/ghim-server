import type { GroupReview } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import type { OpsScope, PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { Jobs } from '../../lib/jobs.js';
import { canHandle, type Route, routeOf } from './calc/route.calc.js';
import type { ReportRules } from './calc/report.calc.js';
import { type Deadlines, queueOf } from './calc/task.calc.js';
import type { ReportRepository } from './report/report.repository.js';
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
import type { ReviewRepository, ReviewTask } from './review.repository.js';

const DAY_MS = 86_400_000;

export interface ReviewServiceDeps {
  repository: ReviewRepository;
  reports: ReportRepository;
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
    reportHours: config.get('review.reportHours'),
    appealDays: config.get('review.appealDays'),
  });

  const reportRules = (): ReportRules => ({
    autoHideReporters: config.get('report.autoHideReporters'),
    autoHideDevices: config.get('report.autoHideDevices'),
    autoHideMinTier: config.get('report.autoHideMinTier'),
    autoHideWindowHours: config.get('report.autoHideWindowHours'),
    scoreIgnoreBelowMinus: config.get('report.scoreIgnoreAutoHideBelowMinus'),
    scoreLoseRightBelowMinus: config.get('report.scoreLoseRightBelowMinus'),
    loseRightDays: config.get('report.loseRightDays'),
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

  const sharedDevicesOf = (accountId: string): Promise<string[]> =>
    identity.sharedDeviceAccounts(
      accountId,
      new Date(clock().getTime() - config.get('device.dataRetentionDays') * DAY_MS),
    );

  /**
   * Ai xử từng việc, tính lúc đọc (design mục 4): nạp người dự tuyển một lượt cho cả lô — staff đang hoạt động theo
   * danh mục, người xử của từng nhóm, cài đặt "tin nhóm bị giữ do ai duyệt", master — rồi trả hàm tính cho từng việc.
   */
  const routesFor = async (tasks: readonly ReviewTask[]): Promise<(task: ReviewTask) => Route> => {
    const categoryIds = [...new Set(tasks.flatMap((task) => task.categoryId ?? []))];
    const groupIds = [...new Set(tasks.flatMap((task) => task.groupId ?? []))];
    const aboutPeople = tasks.some((task) => task.accountId !== null);
    const [staff, masters, settings, reviewers, safety] = await Promise.all([
      deps.platform.activeStaffByCategory(categoryIds),
      identity.masterIds(),
      Promise.all(
        categoryIds.map(
          async (id) => [id, (await deps.categories.settingsOf(id)).groupReview] as const,
        ),
      ),
      Promise.all(groupIds.map(async (id) => [id, await deps.groups.reviewersOf(id)] as const)),
      aboutPeople ? deps.platform.activeStaffWithScope('user_reports') : Promise.resolve([]),
    ]);
    const groupReview = new Map<string, GroupReview>(settings);
    const groups = new Map(reviewers);
    return (task) =>
      routeOf({
        subject: subjectOf(task),
        queue: queueOf(task.reasons),
        reasons: task.reasons,
        placement: task.placement,
        groupId: task.groupId,
        unitId: task.unitId,
        groupReview: (task.categoryId && groupReview.get(task.categoryId)) || 'group',
        escalated: task.escalatedAt !== null,
        excluded: new Set(task.excludedIds),
        group: (task.groupId && groups.get(task.groupId)) || null,
        categoryStaff: (task.categoryId && staff.get(task.categoryId)) || [],
        safetyStaff: safety,
        masters,
      });
  };

  /** Người hỏi trên bàn vận hành: master, hay danh mục staff đang hoạt động (đọc lại mỗi lượt, không tin token). */
  const viewerOf = async (actor: Actor): Promise<Viewer> => {
    if (actor.role === 'master') {
      return {
        accountId: actor.accountId,
        isMaster: true,
        categoryIds: new Set(),
        scopes: new Set(),
      };
    }
    const grant = await deps.privileges.staffGrant(actor.accountId);
    const active = grant?.status === 'active';
    return {
      accountId: actor.accountId,
      isMaster: false,
      categoryIds: new Set(active ? grant.categoryIds : []),
      scopes: new Set(active ? grant.scopes : []),
    };
  };

  /** Việc theo phạm vi đang xem, kèm người xử; `null` = không có hay ngoài phạm vi (404). */
  const locateTask = async (actor: Actor, taskId: string, surface: Surface) => {
    const task = await deps.repository.findTask(taskId);
    if (!task || (surface.kind === 'group' && task.groupId !== surface.groupId)) return null;
    // Route của nhóm không đòi lớp thứ hai, nên ở đó chỉ vai trong nhóm được tính; quyền master đi qua bàn vận hành
    // (spec review/queues, chốt 15/10/2026).
    const viewer: Viewer =
      surface.kind === 'ops'
        ? await viewerOf(actor)
        : {
            accountId: actor.accountId,
            isMaster: false,
            categoryIds: new Set(),
            scopes: new Set(),
          };
    const route = (await routesFor([task]))(task);
    return {
      task,
      viewer,
      route,
      allowed: mayHandle(task, route, actor.accountId, viewer.isMaster),
    };
  };

  return {
    ...deps,
    random: deps.random ?? (() => Math.random() * 100),
    deadlines,
    reportRules,
    withSharedDevices,
    sharedDevicesOf,
    routesFor,
    viewerOf,
    locateTask,
  };
}

/** Chủ thể của việc — CHECK của bảng bảo đảm đúng một trong ba (add-reports, add-strikes). */
export const subjectOf = (
  task: Pick<ReviewTask, 'listingId' | 'accountId' | 'strikeId'>,
): 'listing' | 'account' | 'strike' =>
  task.strikeId ? 'strike' : task.accountId ? 'account' : 'listing';

/**
 * Master xử mọi việc kể cả việc có mình trong danh sách loại trừ (spec review/queues) — trừ việc về gậy: master ra gậy
 * nghiêm trọng không tự quyết, việc đó mở với người ra gậy trong danh sách loại trừ (spec serious-strikes).
 */
export const mayHandle = (
  task: Pick<ReviewTask, 'strikeId' | 'excludedIds'>,
  route: Route,
  accountId: string,
  isMaster: boolean,
): boolean =>
  canHandle(route, accountId, isMaster) &&
  !(isMaster && task.strikeId !== null && task.excludedIds.includes(accountId));

/** Bàn vận hành (staff, master) hay app của nhóm (điều hành viên, chủ nhóm) — việc ngoài nhóm đang xem là 404. */
export type Surface = { kind: 'ops' } | { kind: 'group'; groupId: string };

export interface Viewer {
  accountId: string;
  isMaster: boolean;
  /** Danh mục staff đang hoạt động; master thì rỗng — master xử mọi việc. */
  categoryIds: ReadonlySet<string>;
  /** Việc ở bàn vận hành của staff đang hoạt động — `user_reports` xử báo cáo về một người. */
  scopes: ReadonlySet<OpsScope>;
}

export type ReviewShared = ReturnType<typeof createReviewShared>;
