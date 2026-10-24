import { DAY_MS, type DayCount, dayKeyVN, startOfDayVN } from '../../../common/time/time.js';
import type { DayStatsDto } from '../ops.schema.js';

/*
 * Bảng số theo ngày (add-ops-daily-stats): bốn module đếm riêng theo khoá ngày Việt Nam, đây ghép lại và điền 0 cho
 * ngày không có gì — thuần, không đọc DB.
 */

export interface DayRuns {
  day: string;
  started: number;
  passFull: number;
  passLimited: number;
  hold: number;
}

export interface DayDecisions {
  day: string;
  passed: number;
  rejected: number;
}

export interface DailyParts {
  accounts: DayCount[];
  firstLive: DayCount[];
  runs: DayRuns[];
  decisions: DayDecisions[];
}

/** `[from, to)`: 00:00 Việt Nam của ngày `now − (days − 1)` tới 00:00 Việt Nam của ngày mai — hôm nay đang dở vẫn vào. */
export function rangeFor(now: Date, days: number): { from: Date; to: Date } {
  const today = startOfDayVN(now);
  return {
    from: new Date(today.getTime() - (days - 1) * DAY_MS),
    to: new Date(today.getTime() + DAY_MS),
  };
}

/** Khoá ngày của `days` ngày gần nhất, hôm nay trước. */
export function dayKeys(now: Date, days: number): string[] {
  const today = startOfDayVN(now);
  return Array.from({ length: days }, (_, i) => dayKeyVN(new Date(today.getTime() - i * DAY_MS)));
}

const byDay = <T extends { day: string }>(rows: T[]): Map<string, T> =>
  new Map(rows.map((row) => [row.day, row]));

export function mergeDaily(keys: string[], parts: DailyParts): DayStatsDto[] {
  const accounts = byDay(parts.accounts);
  const firstLive = byDay(parts.firstLive);
  const runs = byDay(parts.runs);
  const decisions = byDay(parts.decisions);
  return keys.map((day) => ({
    day,
    newAccounts: accounts.get(day)?.count ?? 0,
    submissions: runs.get(day)?.started ?? 0,
    firstLive: firstLive.get(day)?.count ?? 0,
    machine: {
      passFull: runs.get(day)?.passFull ?? 0,
      passLimited: runs.get(day)?.passLimited ?? 0,
      hold: runs.get(day)?.hold ?? 0,
    },
    decisions: {
      passed: decisions.get(day)?.passed ?? 0,
      rejected: decisions.get(day)?.rejected ?? 0,
    },
  }));
}
