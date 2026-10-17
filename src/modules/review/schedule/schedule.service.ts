import type { ReviewTask } from '@prisma/client';

import { startOfDayVN } from '../../../common/time/time.js';
import { sequentially } from '../../../common/utils/sequential.js';
import { riskSamplePercent, sampled } from '../calc/sampling.calc.js';
import { completionAlert, weeklyCompletion } from '../calc/stats.calc.js';
import {
  DUE_SOON_HOURS,
  dueSoonWarning,
  masterReminderDue,
  overdueAction,
  SAMPLE_REASONS,
} from '../calc/task.calc.js';
import type { ReviewQueueService } from '../queue/queue.service.js';
import { REVIEW_EVENTS, reviewEvent } from '../review.outbox.js';
import type { ReviewShared } from '../review.shared.js';

export interface ReviewScheduleService {
  /** Mỗi phút: chuyển master việc quá hạn, huỷ mẫu hậu kiểm quá hạn, khiếu nại gậy thường quá hạn tự thắng, dọn nhận việc hết giờ. */
  everyMinute(): Promise<{ escalated: number; expired: number; claimsCleared: number }>;
  /** Mỗi giờ: lấy mẫu theo rủi ro, nhắc master việc nằm ở hàng master lâu, cảnh báo nhiều việc sắp chạm hạn. */
  everyHour(): Promise<{ considered: number; sampled: number; reminded: number; warned: boolean }>;
  /** Thứ Hai 08:00: tỉ lệ hậu kiểm làm xong của tuần trước, dưới ngưỡng thì báo master. */
  weeklyPostcheck(): Promise<{ rate: number | null; alerted: boolean }>;
}

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Một lượt lấy mẫu đọc tối đa ngần này ứng viên — còn thì lượt giờ sau làm tiếp. */
const CANDIDATE_BATCH = 500;
const SAMPLES = [...SAMPLE_REASONS];

/**
 * Việc theo lịch của hàng chờ (design add-review-queues mục 9). Quá hạn chỉ chuyển cấp hay huỷ mẫu, không bao giờ đổi
 * tin; lấy mẫu đi qua `addReason` như mọi lối sinh việc.
 */
export function createScheduleService(
  shared: ReviewShared,
  queue: ReviewQueueService,
): ReviewScheduleService {
  const { repository, listings, screening, trust, config, clock, random, routesFor } = shared;

  const drawSamples = async (): Promise<{ considered: number; sampled: number }> => {
    const candidates = await repository.sampleCandidates(CANDIDATE_BATCH);
    const percents = {
      borderline: config.get('postcheck.borderlineSamplePercent'),
      newAccount: config.get('postcheck.newAccountSamplePercent'),
      other: config.get('postcheck.otherSamplePercent'),
    };
    const drawn: string[] = [];
    await sequentially(candidates, async ({ listingId, listingVersion, approvedBy }) => {
      const subject = await listings.reviewSubject(listingId);
      // Tin đã sửa, rời bảng hay đang có việc mở thì không lấy mẫu phiên bản này (spec review/post-review); tin đang
      // tạm ẩn cũng không (T7).
      if (subject?.state !== 'live' || subject.version !== listingVersion) return;
      if (subject.hideReasons.length > 0) return;
      if (await repository.hasOpenTask(listingId)) return;
      const run = await screening.runOf(listingId);
      const tier = run?.tier ?? (await trust.tierOf(subject.ownerId));
      const percent = riskSamplePercent({ score: run?.score ?? null, tier }, percents);
      if (!sampled(percent, random())) return;
      // Người cho đạt / khôi phục phiên bản này không tự hậu kiểm nó (spec conflict-of-interest, T2).
      await queue.addReason(listingId, {
        reason: 'sample_risk',
        alsoExclude: approvedBy ? [approvedBy] : [],
      });
      drawn.push(listingId);
    });
    await repository.removeCandidates(
      candidates.map(({ listingId, listingVersion }) => ({ listingId, listingVersion })),
    );
    return { considered: candidates.length, sampled: drawn.length };
  };

  /** Việc ở bậc master quá `review.remindMasterHours`, nhắc lại mỗi ngày — một sự kiện cho cả lượt. */
  const remindMasters = async (open: readonly ReviewTask[], now: Date): Promise<number> => {
    const routeOf = await routesFor(open);
    const afterHours = config.get('review.remindMasterHours');
    const atMaster = open.filter((task) => routeOf(task).level === 'master');
    // Câu nhắc nêu mọi việc đang quá hạn ở hàng master, không chỉ việc vừa tới hạn nhắc trong lượt này (T9).
    const overdue = atMaster.filter(
      (task) =>
        (task.escalatedAt ?? task.createdAt).getTime() + afterHours * HOUR_MS <= now.getTime(),
    );
    const due = atMaster.filter((task) =>
      masterReminderDue({
        atMasterSince: task.escalatedAt ?? task.createdAt,
        remindedAt: task.remindedAt,
        now,
        afterHours,
      }),
    );
    if (due.length === 0) return 0;
    await repository.markReminded(
      due.map((task) => task.id),
      now,
      reviewEvent(REVIEW_EVENTS.masterReminder, { count: overdue.length, hours: afterHours }),
    );
    return due.length;
  };

  /** Một nửa số việc chưa chuyển master sẽ chạm hạn trong 24 giờ tới (TK 16). */
  const warnDueSoon = async (open: readonly ReviewTask[], now: Date): Promise<boolean> => {
    const waiting = open.filter((task) => !task.escalatedAt);
    const soon = waiting.filter(
      (task) => task.dueAt.getTime() <= now.getTime() + DUE_SOON_HOURS * HOUR_MS,
    );
    if (!dueSoonWarning(waiting.length, soon.length)) return false;
    await repository.emit(
      reviewEvent(REVIEW_EVENTS.deadlineWarning, {
        open: waiting.length,
        dueSoon: soon.length,
        hours: DUE_SOON_HOURS,
      }),
    );
    return true;
  };

  /**
   * Khiếu nại gậy thường quá hạn xét tự thắng, đúng hệ quả như người xét chấp nhận (spec appeals); gậy nặng chuyển
   * master như mọi việc, gậy nghiêm trọng vốn ở master. Đóng việc chỉ khi nó còn đúng là việc đang mở của gậy.
   */
  const appealAutoWin = async (task: ReviewTask, now: Date): Promise<boolean> => {
    const { strikeId } = task;
    if (!strikeId || !task.reasons.includes('appeal')) return false;
    const strike = await trust.strikeDetail(strikeId);
    if (strike?.kind !== 'normal' || strike.appeal?.status !== 'pending') return false;
    return repository.withOpenStrikeTask(strikeId, async (tx, open) => {
      if (open?.id !== task.id) return false;
      await trust.decideAppeal(tx, { strikeId, verdict: 'won', by: null, at: now });
      await repository.closeTask(tx, open.id, 'expired', now);
      return true;
    });
  };

  return {
    async everyMinute() {
      const now = clock();
      const escalated: string[] = [];
      const expired: string[] = [];
      const overdue = await repository.overdueTasks(now);
      const routeOf = await routesFor(overdue);
      await sequentially(overdue, async (task) => {
        const action = overdueAction(task, now);
        if (action === 'escalate' && (await appealAutoWin(task, now))) {
          expired.push(task.id);
          return;
        }
        // Việc đã ở bậc master (danh mục chưa có staff) thì không chuyển: thời gian ở hàng master — mốc nhắc — vẫn tính
        // từ lúc sinh việc. Danh mục có staff sau đó thì lượt kế tiếp chuyển việc như thường.
        const atMaster = routeOf(task).level === 'master';
        if (action === 'escalate' && !atMaster && (await repository.escalateTask(task.id, now))) {
          escalated.push(task.id);
        }
        // Chỉ việc về tin có lý do mẫu — việc về người không bao giờ tự huỷ.
        if (action === 'expire' && task.listingId) {
          // Mẫu không ai xử kịp: huỷ, đếm "bỏ sót"; tin không đổi (spec review/post-review).
          await queue.dropReasons(task.listingId, SAMPLES, 'expired');
          expired.push(task.id);
        }
      });
      const claimsCleared = await repository.sweepClaims(now);
      return { escalated: escalated.length, expired: expired.length, claimsCleared };
    },

    async everyHour() {
      const drawn = await drawSamples();
      const now = clock();
      const open = await repository.openTasks({});
      const reminded = await remindMasters(open, now);
      const warned = await warnDueSoon(open, now);
      return { ...drawn, reminded, warned };
    },

    async weeklyPostcheck() {
      const to = startOfDayVN(clock());
      const from = new Date(to.getTime() - WEEK_MS);
      const { done, expired } = await repository.closedSamples(from, to);
      const rate = weeklyCompletion(done, expired);
      const threshold = config.get('postcheck.alertBelowCompletionPercent');
      const alerted = completionAlert(rate, threshold);
      if (alerted) {
        await repository.emit(
          reviewEvent(REVIEW_EVENTS.postcheckLow, {
            rate,
            done,
            expired,
            threshold,
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        );
      }
      return { rate, alerted };
    },
  };
}
