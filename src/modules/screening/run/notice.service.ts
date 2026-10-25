import type { ScreeningRun } from '@prisma/client';

import type { MachineNotice } from '../../listing/listing.ports.js';
import type { HoldNotice } from '../../trust/trust.shared.js';
import { type Explanation, imageFixMessage, renderExplanation } from '../calc/explanation.calc.js';
import { qualityIssues } from '../calc/quality.calc.js';
import { type QualityCode, UNREADABLE_IMAGE } from '../screening.rules.js';
import { qualityLimits, type ScreeningShared } from '../screening.shared.js';

export interface ScreeningNoticeService {
  /** Cổng `listing`: câu của lượt kết luận gần nhất mỗi tin — `listing` chọn hiện theo trạng thái tin. */
  notices(listingIds: string[]): Promise<Map<string, MachineNotice>>;
  /** Cổng `HoldExplanation` của bảng uy tín: câu của lần giữ gần nhất mỗi tin chờ duyệt. */
  explainHolds(listingIds: string[]): Promise<Map<string, HoldNotice>>;
  cooldownOf(accountId: string): Promise<Date | null>;
  /** Cổng `NameScreen` của `identity`: tên trúng cụm mức chắc đang bật — cụm mơ hồ không tác dụng với tên (câu 12). */
  hiddenNames(names: string[]): Promise<Set<string>>;
  /**
   * Cổng cho `messaging` (add-messaging): cùng bộ so của tin đăng. `blocked` = trúng cụm mức chắc đang bật; `flagged` =
   * trúng cụm mơ hồ đang bật; cụm chạy thử không đổi gì (spec banned-phrases).
   */
  phraseVerdict(text: string): Promise<{ blocked: boolean; flagged: boolean }>;
  /**
   * Cổng cho `messaging` (add-message-images): ảnh tin nhắn qua cùng luật chất lượng của ảnh tin — luật đang bật, ngưỡng
   * của bảng con số — nhưng đo ngay trong lượt gửi, vì tin nhắn không chờ người: trúng là không gửi. Ảnh hỏng luôn chặn.
   * Không so trùng, không xét nội dung (quyết định 24/10/2026). `null` = mọi ảnh qua; không thì lỗi của ảnh đầu tiên trúng.
   */
  messageImageIssue(imageIds: string[]): Promise<{ code: QualityCode; message: string } | null>;
}

/** Điều `screening` cho module khác hiện ra (design mục 8, 9): câu báo, thời gian chờ, tên bị lọc. */
export function createNoticeService(shared: ScreeningShared): ScreeningNoticeService {
  const { repository, media, inspector, config, clock } = shared;

  /** Lượt gần nhất của mỗi tin — lượt đó không có câu (cho qua đầy đủ) thì tin không có câu. */
  const latestNotices = (runs: ScreeningRun[]): Map<string, MachineNotice> => {
    const seen = new Set<string>();
    const notices = new Map<string, MachineNotice>();
    for (const run of runs) {
      if (seen.has(run.listingId)) continue;
      seen.add(run.listingId);
      // Cột do chính lượt kết luận ghi (`explanation.calc.ts`).
      const explanation = run.explanation as Explanation | null;
      if (explanation) {
        notices.set(
          run.listingId,
          renderExplanation(explanation, run.lookupCode, config.get('review.machineHoldHours')),
        );
      }
    }
    return notices;
  };

  return {
    async notices(listingIds) {
      return latestNotices(await repository.decidedRuns(listingIds));
    },

    async explainHolds(listingIds) {
      const notices = latestNotices(await repository.decidedRuns(listingIds));
      return new Map(
        [...notices].map(([id, notice]) => [
          id,
          {
            reason: notice.message,
            estimatedWait: notice.estimatedWait,
            lookupCode: notice.lookupCode,
          },
        ]),
      );
    },

    cooldownOf: (accountId) => repository.activeCooldown(accountId, clock()),

    async phraseVerdict(text) {
      const { matcher } = await shared.rules.current();
      const live = matcher.match(text).filter((hit) => hit.mode === 'on');
      return {
        blocked: live.some((hit) => hit.level === 'certain'),
        flagged: live.some((hit) => hit.level === 'ambiguous'),
      };
    },

    async messageImageIssue(imageIds) {
      const [{ snapshot }, measures] = await Promise.all([
        shared.rules.current(),
        Promise.all(
          imageIds.map(async (imageId) => {
            const bytes = await media.readImage(imageId);
            return bytes ? inspector.inspect(bytes).catch(() => null) : null;
          }),
        ),
      ]);
      const on = new Set(
        snapshot.rules.filter((rule) => rule.mode === 'on').map((rule) => rule.code),
      );
      const limits = qualityLimits(config);
      const issues = measures.map((measure): QualityCode | undefined =>
        measure === null
          ? UNREADABLE_IMAGE
          : qualityIssues(measure, limits).find((code) => on.has(code)),
      );
      const index = issues.findIndex((code) => code !== undefined);
      const code = issues[index];
      return code ? { code, message: imageFixMessage(code, `Ảnh ${index + 1}`) } : null;
    },

    async hiddenNames(names) {
      const { matcher } = await shared.rules.current();
      return new Set(
        names.filter((name) =>
          matcher.match(name).some((hit) => hit.level === 'certain' && hit.mode === 'on'),
        ),
      );
    },
  };
}
