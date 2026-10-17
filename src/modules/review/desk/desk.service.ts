import type { Actor } from '../../../common/auth/actor.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { type PaginationQuery, toPage, toSkipTake } from '../../../common/schemas/pagination.js';
import { sequentially } from '../../../common/utils/sequential.js';
import { RELATED_REPORTS } from '../calc/report.calc.js';
import type { Route } from '../calc/route.calc.js';
import { REPORT_REASONS } from '../calc/task.calc.js';
import type { StrikeDetailDto } from '../../trust/strike/strike.schema.js';
import { toRelated } from '../report/report.service.js';
import type { ReportWithEntries } from '../report/report.repository.js';
import type { ReviewTask } from '../review.repository.js';
import type { ClaimResultDto, QueueQuery, TaskDetailDto, TaskItemDto } from '../review.schema.js';
import {
  mayHandle,
  type ReviewShared,
  subjectOf,
  type Surface,
  taskClaimed,
  taskClosed,
  taskNotFound,
  type Viewer,
} from '../review.shared.js';

const MINUTE_MS = 60_000;
const GROUP_LEVELS: ReadonlySet<Route['level']> = new Set([
  'unit_moderators',
  'group_moderators',
  'group_owner',
]);

interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const claimState = (task: ReviewTask, accountId: string, now: Date) => {
  const live = task.claimedBy && task.claimExpiresAt && task.claimExpiresAt > now;
  if (!live) return { state: 'free' as const, expiresAt: null };
  return {
    state: task.claimedBy === accountId ? ('mine' as const) : ('taken' as const),
    expiresAt: task.claimExpiresAt?.toISOString() ?? null,
  };
};

export interface ReviewDeskService {
  opsQueue(actor: Actor, query: QueueQuery): Promise<Page<TaskItemDto>>;
  groupQueue(actor: Actor, groupId: string, query: PaginationQuery): Promise<Page<TaskItemDto>>;
  task(actor: Actor, taskId: string, surface: Surface): Promise<TaskDetailDto>;
  claim(actor: Actor, taskId: string, surface: Surface): Promise<ClaimResultDto>;
  /** Người này vừa đổi vai hay quyền: trả những việc họ đang giữ mà không còn xử được (spec review/task-handling). */
  recheckClaims(accountId: string): Promise<number>;
  /** Tài khoản bị khoá, bị xoá: trả mọi việc họ đang giữ. */
  releaseAllClaims(accountId: string): Promise<number>;
  /** Tài khoản bị khoá trả mọi việc đang giữ — chỉ khi nó còn đang bị khoá lúc xử (fix-audit-listeners, C1). */
  onAccountLocked(accountId: string): Promise<number>;
  /** Nhóm thôi cho điều hành (bị khoá…): trả việc của nhóm đang ở tay người không còn xử được. */
  recheckGroupClaims(groupId: string): Promise<number>;
}

export function createDeskService(shared: ReviewShared): ReviewDeskService {
  const {
    repository,
    reports,
    listings,
    screening,
    identity,
    trust,
    media,
    messaging,
    groups,
    config,
    clock,
  } = shared;
  const { routesFor, viewerOf, sharedDevicesOf, withSharedDevices, locateTask } = shared;

  const items = async (
    tasks: readonly { task: ReviewTask; route: Route }[],
    accountId: string,
  ): Promise<TaskItemDto[]> => {
    const strikes = await strikeMap(tasks.flatMap(({ task }) => task.strikeId ?? []));
    const subjectAccount = (task: ReviewTask): string | null =>
      task.accountId ?? (task.strikeId ? (strikes.get(task.strikeId)?.accountId ?? null) : null);
    const [titles, names] = await Promise.all([
      listings.titles(tasks.flatMap(({ task }) => task.listingId ?? [])),
      nameMap(tasks.flatMap(({ task }) => subjectAccount(task) ?? [])),
    ]);
    const now = clock();
    return tasks.map(({ task, route }) => ({
      id: task.id,
      subjectKind: subjectOf(task),
      listingId: task.listingId,
      accountId: task.accountId,
      strikeId: task.strikeId,
      title: task.listingId
        ? (titles.get(task.listingId) ?? null)
        : (names.get(subjectAccount(task) ?? '') ?? null),
      queue: task.queue,
      reasons: task.reasons,
      dueAt: task.dueAt.toISOString(),
      overdue: task.dueAt <= now,
      level: route.level,
      categoryId: task.categoryId,
      groupId: task.groupId,
      claim: claimState(task, accountId, now),
    }));
  };

  /**
   * Việc chỉ còn lý do báo cáo mà mọi lượt báo đều của người điểm báo cáo thấp xếp sau mọi việc khác (TK 23) — giữ thứ
   * tự hạn trong mỗi phần.
   */
  const lowPriorityLast = async (
    routed: { task: ReviewTask; route: Route }[],
  ): Promise<{ task: ReviewTask; route: Route }[]> => {
    const reportOnly = routed.filter(({ task }) =>
      task.reasons.every((reason) => REPORT_REASONS.has(reason)),
    );
    if (reportOnly.length === 0) return routed;
    const low = await reports.lowPriorityOpen({
      listingIds: reportOnly.flatMap(({ task }) => task.listingId ?? []),
      accountIds: reportOnly.flatMap(({ task }) => task.accountId ?? []),
    });
    const isLow = ({ task }: { task: ReviewTask }) =>
      reportOnly.some((entry) => entry.task.id === task.id) &&
      (task.listingId
        ? low.listingIds.has(task.listingId)
        : low.accountIds.has(task.accountId ?? ''));
    return [...routed.filter((entry) => !isLow(entry)), ...routed.filter(isLow)];
  };

  const paged = async (
    routed: { task: ReviewTask; route: Route }[],
    accountId: string,
    query: PaginationQuery,
  ): Promise<Page<TaskItemDto>> => {
    const { skip, take } = toSkipTake(query);
    const ordered = await lowPriorityLast(routed);
    return toPage(await items(ordered.slice(skip, skip + take), accountId), routed.length, query);
  };

  /**
   * Người đã chuyển lên (và tài khoản dùng chung máy với họ) nhận chính việc hàng 4 đó: 403 — họ có quyền xử danh mục,
   * chỉ bị luật hai người chặn (spec review/conflict-of-interest). Ai khác ngoài phạm vi: 404 như việc không tồn tại.
   */
  const refused = async (task: ReviewTask, viewer: Viewer): Promise<Error> => {
    const wouldHandle = task.categoryId !== null && viewer.categoryIds.has(task.categoryId);
    if (task.escalatedBy && wouldHandle) {
      const escalators = await withSharedDevices([task.escalatedBy]);
      if (escalators.includes(viewer.accountId)) {
        return new ForbiddenError('Việc cần một người khác người đã chuyển lên');
      }
    }
    // Việc về gậy: người ra gậy, người nhận và máy của họ có quyền trên phạm vi, chỉ bị luật hai người chặn (spec appeals).
    if (
      task.strikeId &&
      (wouldHandle || viewer.isMaster) &&
      task.excludedIds.includes(viewer.accountId)
    ) {
      return new ForbiddenError('Việc về gậy cần một người khác người ra gậy hay người nhận gậy');
    }
    return taskNotFound();
  };

  /** Hồ sơ gậy của các việc về gậy trong một trang — tên người nhận làm tiêu đề việc (add-strikes). */
  const strikeMap = async (ids: string[]): Promise<Map<string, StrikeDetailDto>> => {
    const found = await Promise.all([...new Set(ids)].map((id) => trust.strikeDetail(id)));
    return new Map(found.flatMap((strike) => (strike ? [[strike.id, strike] as const] : [])));
  };

  /** Bản ghi hội thoại mà lượt báo của báo cáo đang mở trỏ tới — chỉ tới khi báo cáo đóng (spec review/reports). */
  const transcriptsOf = async (related: ReportWithEntries[]) => {
    const ids = related
      .filter((report) => report.status === 'open')
      .flatMap((report) => report.entries.flatMap((entry) => entry.conversationId ?? []));
    return [...(await messaging.transcripts([...new Set(ids)])).values()];
  };

  const nameMap = async (ids: string[]): Promise<Map<string, string | null>> => {
    const summaries = await identity.accountSummaries([...new Set(ids)]);
    return new Map([...summaries].map(([id, summary]) => [id, summary.displayName]));
  };

  /** Việc về một người: hồ sơ, mức, tin sạch, tài khoản dùng chung máy, báo cáo về người đó (add-reports). */
  const accountDetail = async (
    task: ReviewTask,
    route: Route,
    viewerId: string,
  ): Promise<TaskDetailDto> => {
    const accountId = task.accountId ?? '';
    const [[item], tier, cleanListings, strikes, sharedDevices, related] = await Promise.all([
      items([{ task, route }], viewerId),
      trust.tierOf(accountId),
      trust.cleanCount(accountId),
      trust.strikesOf(accountId),
      sharedDevicesOf(accountId),
      reports.related({ listingId: null, accountId, limit: RELATED_REPORTS }),
    ]);
    if (!item) throw taskNotFound();
    const names = await nameMap([accountId, ...sharedDevices]);
    return {
      ...item,
      listing: null,
      listingDeleted: false,
      machine: null,
      seller: {
        accountId,
        displayName: names.get(accountId) ?? null,
        tier,
        cleanListings,
        strikes,
      },
      duplicates: [],
      sharedDeviceAccounts: sharedDevices.map((id) => ({
        accountId: id,
        displayName: names.get(id) ?? null,
      })),
      escalation: null,
      reports: related.map(toRelated),
      conversations: await transcriptsOf(related),
      strike: null,
    };
  };

  /** Việc về một gậy (add-strikes): hồ sơ gậy (điều trích, lời khiếu nại, nhận xét), người nhận, tin đi kèm nếu còn. */
  const strikeDetail = async (
    task: ReviewTask,
    route: Route,
    viewerId: string,
  ): Promise<TaskDetailDto> => {
    const strike = await trust.strikeDetail(task.strikeId ?? '');
    if (!strike) throw taskNotFound();
    const { accountId, listingId } = strike;
    const [[item], tier, cleanListings, strikes, sharedDevices, related, listing, subject] =
      await Promise.all([
        items([{ task, route }], viewerId),
        trust.tierOf(accountId),
        trust.cleanCount(accountId),
        trust.strikesOf(accountId),
        sharedDevicesOf(accountId),
        reports.related({ listingId, accountId, limit: RELATED_REPORTS }),
        listingId ? listings.forReviewer(listingId) : Promise.resolve(null),
        listingId
          ? listings.reviewSubject(listingId, { includeDeleted: true })
          : Promise.resolve(null),
      ]);
    if (!item) throw taskNotFound();
    const names = await nameMap([accountId, ...sharedDevices]);
    return {
      ...item,
      listing,
      listingDeleted: subject?.deleted ?? false,
      machine: null,
      seller: {
        accountId,
        displayName: names.get(accountId) ?? null,
        tier,
        cleanListings,
        strikes,
      },
      duplicates: [],
      sharedDeviceAccounts: sharedDevices.map((id) => ({
        accountId: id,
        displayName: names.get(id) ?? null,
      })),
      escalation: null,
      reports: related.map(toRelated),
      conversations: await transcriptsOf(related),
      strike,
    };
  };

  const recheck = async (task: ReviewTask, accountId: string): Promise<boolean> => {
    const [summary] = [...(await identity.accountSummaries([accountId])).values()];
    const isMaster = summary?.role === 'master' && summary.status === 'active';
    const route = (await routesFor([task]))(task);
    if (mayHandle(task, route, accountId, isMaster)) return false;
    return repository.releaseClaim(task.id, accountId);
  };

  return {
    async opsQueue(actor, query) {
      const viewer = await viewerOf(actor);
      const safety = viewer.scopes.has('user_reports');
      if (!viewer.isMaster && viewer.categoryIds.size === 0 && !safety) throw new ForbiddenError();
      const tasks = await repository.openTasks(
        viewer.isMaster
          ? {}
          : {
              ...(viewer.categoryIds.size > 0 ? { categoryIds: [...viewer.categoryIds] } : {}),
              accountTasks: safety,
            },
      );
      const routeOf = await routesFor(tasks);
      const routed = tasks
        .map((task) => ({ task, route: routeOf(task) }))
        .filter(({ task, route }) => mayHandle(task, route, actor.accountId, viewer.isMaster))
        .filter(({ task }) => query.queue === undefined || task.queue === query.queue)
        .filter(({ route }) => !query.atMaster || route.level === 'master');
      return paged(routed, actor.accountId, query);
    },

    async groupQueue(actor, groupId, query) {
      const reviewers = await groups.reviewersOf(groupId);
      if (!reviewers) throw new NotFoundError('Không có nhóm này');
      const hasRole =
        reviewers.ownerId === actor.accountId ||
        reviewers.moderators.some((moderator) => moderator.accountId === actor.accountId);
      if (!hasRole) throw new ForbiddenError();
      const tasks = await repository.openTasks({ groupId });
      const routeOf = await routesFor(tasks);
      const routed = tasks
        .map((task) => ({ task, route: routeOf(task) }))
        .filter(
          ({ route }) => GROUP_LEVELS.has(route.level) && route.handlers.includes(actor.accountId),
        );
      return paged(routed, actor.accountId, query);
    },

    async task(actor, taskId, surface) {
      const found = await locateTask(actor, taskId, surface);
      if (!found?.allowed) throw found ? await refused(found.task, found.viewer) : taskNotFound();
      const { task, route } = found;
      if (task.strikeId) return strikeDetail(task, route, actor.accountId);
      if (!task.listingId) return accountDetail(task, route, actor.accountId);
      const { listingId } = task;
      const [listing, subject] = await Promise.all([
        listings.forReviewer(listingId),
        listings.reviewSubject(listingId, { includeDeleted: true }),
      ]);
      if (!listing) throw taskNotFound();
      const ownerId = listing.ownerId;
      const [[item], machine, tier, cleanListings, strikes, matches, sharedDevices, related] =
        await Promise.all([
          items([{ task, route }], actor.accountId),
          screening.runOf(listingId),
          trust.tierOf(ownerId),
          trust.cleanCount(ownerId),
          trust.strikesOf(ownerId),
          screening.duplicateMatches(listingId),
          sharedDevicesOf(ownerId),
          reports.related({ listingId, accountId: ownerId, limit: RELATED_REPORTS }),
        ]);
      const owners = await media.ownersOf(matches.map((match) => match.matchImageId));
      const names = await nameMap([
        ownerId,
        ...matches.map((match) => match.accountId),
        ...sharedDevices,
      ]);
      if (!item) throw taskNotFound();
      return {
        ...item,
        listing,
        listingDeleted: subject?.deleted ?? false,
        machine,
        seller: {
          accountId: ownerId,
          displayName: names.get(ownerId) ?? null,
          tier,
          cleanListings,
          strikes,
        },
        duplicates: matches.map((match) => {
          const owner = owners.get(match.matchImageId);
          return {
            ...match,
            displayName: names.get(match.accountId) ?? null,
            listingId: owner?.kind === 'listing' ? owner.id : null,
          };
        }),
        sharedDeviceAccounts: sharedDevices.map((accountId) => ({
          accountId,
          displayName: names.get(accountId) ?? null,
        })),
        escalation:
          task.escalatedBy && task.escalationNote
            ? { by: task.escalatedBy, note: task.escalationNote }
            : null,
        reports: related.map(toRelated),
        conversations: await transcriptsOf(related),
        strike: null,
      };
    },

    async claim(actor, taskId, surface) {
      const found = await locateTask(actor, taskId, surface);
      if (!found) throw taskNotFound();
      if (found.task.status !== 'open') throw taskClosed();
      if (!found.allowed) throw await refused(found.task, found.viewer);
      // Việc về tin: giữ phiên bản tin đang thấy — kể cả bản lưu của tin đã xoá còn báo cáo (add-reports).
      let listingVersion: number | null = null;
      if (found.task.listingId) {
        const subject = await listings.reviewSubject(found.task.listingId, {
          includeDeleted: true,
        });
        if (!subject) throw taskClosed();
        listingVersion = subject.version;
      }
      const now = clock();
      const expiresAt = new Date(now.getTime() + config.get('review.claimMinutes') * MINUTE_MS);
      const won = await repository.claim({
        id: taskId,
        accountId: actor.accountId,
        now,
        expiresAt,
        listingVersion,
      });
      if (!won) {
        const fresh = await repository.findTask(taskId);
        throw fresh?.status === 'open' ? taskClaimed() : taskClosed();
      }
      return {
        taskId,
        claimExpiresAt: expiresAt.toISOString(),
        listingVersion,
      };
    },

    async recheckClaims(accountId) {
      const claimed = await repository.claimsOf(accountId, clock());
      let released = 0;
      await sequentially(claimed, async (task) => {
        if (await recheck(task, accountId)) released += 1;
      });
      return released;
    },

    releaseAllClaims: (accountId) => repository.releaseAllClaims(accountId),
    async onAccountLocked(accountId) {
      const [summary] = [...(await identity.accountSummaries([accountId])).values()];
      return summary?.status === 'locked' ? repository.releaseAllClaims(accountId) : 0;
    },

    async recheckGroupClaims(groupId) {
      const now = clock();
      const claimed = (await repository.openTasksInGroup(groupId)).filter(
        (task) => task.claimedBy && task.claimExpiresAt && task.claimExpiresAt > now,
      );
      let released = 0;
      await sequentially(claimed, async (task) => {
        if (task.claimedBy && (await recheck(task, task.claimedBy))) released += 1;
      });
      return released;
    },
  };
}
