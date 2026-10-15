import type { Actor } from '../../../common/auth/actor.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { type PaginationQuery, toPage, toSkipTake } from '../../../common/schemas/pagination.js';
import { sequentially } from '../../../common/utils/sequential.js';
import { canHandle, type Route } from '../calc/route.calc.js';
import type { ReviewTask } from '../review.repository.js';
import type { ClaimResultDto, QueueQuery, TaskDetailDto, TaskItemDto } from '../review.schema.js';
import {
  type ReviewShared,
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
  /** Nhóm thôi cho điều hành (bị khoá…): trả việc của nhóm đang ở tay người không còn xử được. */
  recheckGroupClaims(groupId: string): Promise<number>;
}

export function createDeskService(shared: ReviewShared): ReviewDeskService {
  const { repository, listings, screening, identity, trust, media, groups, config, clock } = shared;
  const { routesFor, viewerOf, sharedDevicesOf, withSharedDevices, locateTask } = shared;

  const items = async (
    tasks: readonly { task: ReviewTask; route: Route }[],
    accountId: string,
  ): Promise<TaskItemDto[]> => {
    const titles = await listings.titles(tasks.map(({ task }) => task.listingId));
    const now = clock();
    return tasks.map(({ task, route }) => ({
      id: task.id,
      listingId: task.listingId,
      title: titles.get(task.listingId) ?? null,
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

  const paged = async (
    routed: { task: ReviewTask; route: Route }[],
    accountId: string,
    query: PaginationQuery,
  ): Promise<Page<TaskItemDto>> => {
    const { skip, take } = toSkipTake(query);
    return toPage(await items(routed.slice(skip, skip + take), accountId), routed.length, query);
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
    return taskNotFound();
  };

  const nameMap = async (ids: string[]): Promise<Map<string, string | null>> => {
    const summaries = await identity.accountSummaries([...new Set(ids)]);
    return new Map([...summaries].map(([id, summary]) => [id, summary.displayName]));
  };

  const recheck = async (task: ReviewTask, accountId: string): Promise<boolean> => {
    const [summary] = [...(await identity.accountSummaries([accountId])).values()];
    const isMaster = summary?.role === 'master' && summary.status === 'active';
    const route = (await routesFor([task]))(task);
    if (canHandle(route, accountId, isMaster)) return false;
    return repository.releaseClaim(task.id, accountId);
  };

  return {
    async opsQueue(actor, query) {
      const viewer = await viewerOf(actor);
      if (!viewer.isMaster && viewer.categoryIds.size === 0) throw new ForbiddenError();
      const tasks = await repository.openTasks(
        viewer.isMaster ? {} : { categoryIds: [...viewer.categoryIds] },
      );
      const routeOf = await routesFor(tasks);
      const routed = tasks
        .map((task) => ({ task, route: routeOf(task) }))
        .filter(({ route }) => viewer.isMaster || route.handlers.includes(actor.accountId))
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
      const listing = await listings.forReviewer(task.listingId);
      if (!listing) throw taskNotFound();
      const ownerId = listing.ownerId;
      const [[item], machine, tier, cleanListings, matches, sharedDevices] = await Promise.all([
        items([{ task, route }], actor.accountId),
        screening.runOf(task.listingId),
        trust.tierOf(ownerId),
        trust.cleanCount(ownerId),
        screening.duplicateMatches(task.listingId),
        sharedDevicesOf(ownerId),
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
        machine,
        seller: {
          accountId: ownerId,
          displayName: names.get(ownerId) ?? null,
          tier,
          cleanListings,
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
      };
    },

    async claim(actor, taskId, surface) {
      const found = await locateTask(actor, taskId, surface);
      if (!found) throw taskNotFound();
      if (found.task.status !== 'open') throw taskClosed();
      if (!found.allowed) throw await refused(found.task, found.viewer);
      const subject = await listings.reviewSubject(found.task.listingId);
      if (!subject) throw taskClosed();
      const now = clock();
      const expiresAt = new Date(now.getTime() + config.get('review.claimMinutes') * MINUTE_MS);
      const won = await repository.claim({
        id: taskId,
        accountId: actor.accountId,
        now,
        expiresAt,
        listingVersion: subject.version,
      });
      if (!won) {
        const fresh = await repository.findTask(taskId);
        throw fresh?.status === 'open' ? taskClaimed() : taskClosed();
      }
      return {
        taskId,
        claimExpiresAt: expiresAt.toISOString(),
        listingVersion: subject.version,
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
