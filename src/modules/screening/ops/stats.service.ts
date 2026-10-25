import type { ScreeningStatsDto } from '../screening.schema.js';
import { isRuleCode, RULE_LABELS } from '../screening.rules.js';
import type { ScreeningShared } from '../screening.shared.js';

/** Luật hiện trong bảng "trúng nhiều nhất" — đủ thấy luật nào đang làm việc, không thành bảng dài. */
const TOP_RULES = 5;

export interface ScreeningStatsService {
  /**
   * Số liệu máy theo tháng cho master (add-screening-stats): `months` tháng gần nhất kể cả tháng này, tháng không có lượt
   * nào vẫn có dòng số 0. Cộng lượt còn chi tiết với số đã gộp khi hết hạn lưu (TK 25), nên kéo xa hơn 180 ngày vẫn đủ.
   */
  monthlyStats(months: number): Promise<ScreeningStatsDto>;
}

/** `YYYY-MM` của tháng thứ `back` trước tháng chứa `now` (giờ UTC — như `date_trunc` của bảng gộp). */
const monthKey = (now: Date, back: number): string => {
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return at.toISOString().slice(0, 7);
};

export function createStatsService(shared: ScreeningShared): ScreeningStatsService {
  const { repository, clock } = shared;
  return {
    async monthlyStats(months) {
      const now = clock();
      const from = new Date(`${monthKey(now, months - 1)}-01T00:00:00.000Z`);
      const [rows, top] = await Promise.all([
        repository.runsByMonth(from),
        repository.topRuleHits(from, TOP_RULES),
      ]);
      const keys = Array.from({ length: months }, (_, i) => monthKey(now, months - 1 - i));
      return {
        months: keys.map((month) => {
          const own = rows.filter((row) => row.month === month);
          const sum = (pick: (row: (typeof own)[number]) => boolean) =>
            own.filter(pick).reduce((total, row) => total + row.runs, 0);
          return {
            month,
            runs: sum(() => true),
            passFull: sum((row) => row.outcome === 'pass_full'),
            passLimited: sum((row) => row.outcome === 'pass_limited'),
            hold: sum((row) => row.outcome === 'hold'),
            low: sum((row) => row.band === 'low'),
            medium: sum((row) => row.band === 'medium'),
            high: sum((row) => row.band === 'high'),
          };
        }),
        topRules: top.map(({ code, runs }) => ({
          code,
          label: isRuleCode(code) ? RULE_LABELS[code] : code,
          runs,
        })),
      };
    },
  };
}
