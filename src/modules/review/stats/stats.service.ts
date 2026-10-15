import { overturnRate, ruleRates } from '../calc/stats.calc.js';
import type { BoardDto, ReviewerRateDto, RuleRateDto } from '../review.schema.js';
import type { ReviewShared } from '../review.shared.js';

export interface ReviewStatsService {
  /** Bảng tồn: việc mở theo hàng, việc quá hạn; việc nằm ở hàng master quá hạn nhắc là quá hạn (spec review/queues). */
  board(): Promise<BoardDto>;
  /** Tỉ lệ bị lật theo người duyệt: trên quyết định "đạt" đã hậu kiểm, phần bị gỡ tin hay gỡ khỏi nhóm. */
  reviewerRates(): Promise<ReviewerRateDto[]>;
  /** Tỉ lệ máy quá tay theo luật: trên tin máy giữ có quyết định của người, phần được cho đạt (delta rule-management). */
  ruleRates(): Promise<RuleRateDto[]>;
}

const HOUR_MS = 3_600_000;

/** Số liệu cho master trên bàn vận hành (design add-review-queues mục 11) — tính lúc hỏi, không lưu. */
export function createStatsService(shared: ReviewShared): ReviewStatsService {
  const { repository, identity, config, clock, routesFor } = shared;

  return {
    async board() {
      const now = clock();
      const open = await repository.openTasks({});
      const routeOf = await routesFor(open);
      const afterHours = config.get('review.remindMasterHours');
      const queues = new Map<number, { queue: number; open: number; overdue: number }>();
      let atMaster = 0;
      let masterOverdue = 0;
      for (const task of open) {
        const row = queues.get(task.queue) ?? { queue: task.queue, open: 0, overdue: 0 };
        row.open += 1;
        if (task.dueAt <= now) row.overdue += 1;
        queues.set(task.queue, row);
        if (routeOf(task).level === 'master') {
          atMaster += 1;
          const since = task.escalatedAt ?? task.createdAt;
          if (now.getTime() - since.getTime() >= afterHours * HOUR_MS) masterOverdue += 1;
        }
      }
      return {
        open: open.length,
        queues: [...queues.values()].toSorted((a, b) => a.queue - b.queue),
        atMaster: { open: atMaster, overdue: masterOverdue, overdueAfterHours: afterHours },
      };
    },

    async reviewerRates() {
      const passes = await repository.postcheckedPasses();
      const byActor = new Map<string, { reviewed: number; overturned: number }>();
      for (const pass of passes) {
        const row = byActor.get(pass.actorId) ?? { reviewed: 0, overturned: 0 };
        row.reviewed += 1;
        if (pass.overturned) row.overturned += 1;
        byActor.set(pass.actorId, row);
      }
      const names = await identity.accountSummaries([...byActor.keys()]);
      return [...byActor]
        .map(([accountId, row]) => ({
          accountId,
          name: names.get(accountId)?.displayName ?? null,
          ...row,
          rate: overturnRate(row.reviewed, row.overturned),
        }))
        .toSorted((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.reviewed - a.reviewed);
    },

    async ruleRates() {
      const decisions = await repository.heldDecisions();
      return ruleRates(
        decisions.map((row) => ({
          hits: row.machineHits,
          outcome: row.outcome,
          judgment: row.machineJudgment,
        })),
      );
    },
  };
}
