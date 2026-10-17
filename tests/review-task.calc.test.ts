import { describe, expect, it } from 'vitest';

import {
  deadlineOf,
  type Deadlines,
  dueSoonWarning,
  earliest,
  masterReminderDue,
  overdueAction,
  queueOf,
  withoutReasons,
  withReasons,
} from '../src/modules/review/calc/task.calc.js';

/* Spec review/queues, phần thuần: hạn xử theo hàng, gộp và bỏ lý do, quá hạn, nhắc master, cảnh báo sắp chạm hạn. */
const HOUR_MS = 3_600_000;
const DEADLINES: Deadlines = {
  machineHoldHours: 24,
  machineRestrictionHours: 72,
  groupEscalationHours: 72,
  sampleDays: 7,
  reportHours: 72,
  appealDays: 7,
};
const at = (iso: string) => new Date(iso);
const plusHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR_MS);

describe('Sáu hàng chờ, mỗi hàng một hạn xử', () => {
  it('máy giữ lúc 10:00 ngày 1 → hạn 10:00 ngày 2', () => {
    expect(deadlineOf('machine_hold', at('2026-10-01T10:00:00+07:00'), DEADLINES)).toEqual(
      at('2026-10-02T10:00:00+07:00'),
    );
  });

  it('chuyển từ nhóm lúc 08:00 thứ Hai → hạn 08:00 thứ Năm', () => {
    expect(deadlineOf('group_escalation', at('2026-10-12T08:00:00+07:00'), DEADLINES)).toEqual(
      at('2026-10-15T08:00:00+07:00'),
    );
  });

  it('mẫu hậu kiểm lúc 08:00 ngày 1 → hạn 08:00 ngày 8', () => {
    expect(deadlineOf('sample_risk', at('2026-10-01T08:00:00+07:00'), DEADLINES)).toEqual(
      at('2026-10-08T08:00:00+07:00'),
    );
  });
});

describe('Một tin, một việc: gộp lý do', () => {
  it('việc hàng 5 thêm lý do máy giữ → hàng 0, hạn 24 giờ kể từ lúc rút về', () => {
    const merged = withReasons(['sample_risk'], ['machine_hold']);
    expect(merged).toEqual(['machine_hold', 'sample_risk']);
    expect(queueOf(merged)).toBe(0);
    const recalled = at('2026-10-02T09:00:00+07:00');
    const sampleDue = plusHours(recalled, 6 * 24);
    expect(earliest(sampleDue, deadlineOf('machine_hold', recalled, DEADLINES))).toEqual(
      plusHours(recalled, 24),
    );
  });

  it('việc hàng 3 còn 2 giờ thêm lý do máy giữ → hàng 0, giữ hạn 2 giờ', () => {
    const now = at('2026-10-02T09:00:00+07:00');
    const restrictedDue = plusHours(now, 2);
    expect(queueOf(withReasons(['machine_restricted'], ['machine_hold']))).toBe(0);
    expect(earliest(restrictedDue, deadlineOf('machine_hold', now, DEADLINES))).toEqual(
      restrictedDue,
    );
  });

  it('gộp lặp lại không nhân đôi lý do', () => {
    expect(withReasons(['machine_hold'], ['machine_hold'])).toEqual(['machine_hold']);
  });

  it('bỏ lý do máy giữ khỏi việc còn "hạn chế do máy" → hàng 3; bỏ hết → không còn lý do', () => {
    const left = withoutReasons(['machine_hold', 'machine_restricted'], ['machine_hold']);
    expect(left).toEqual(['machine_restricted']);
    expect(queueOf(left)).toBe(3);
    expect(withoutReasons(left, ['machine_restricted'])).toEqual([]);
  });

  it('việc không có lý do nào thì không có hàng', () => {
    expect(() => queueOf([])).toThrow();
  });
});

describe('Quá hạn chỉ chuyển cấp', () => {
  const now = at('2026-10-03T10:00:00+07:00');
  const due = plusHours(now, -1);

  it.each([
    [['machine_hold'], 'escalate'],
    [['machine_restricted'], 'escalate'],
    [['group_escalation'], 'escalate'],
    [['sample_risk'], 'expire'],
    [['sample_reviewer', 'sample_risk'], 'expire'],
    [['machine_hold', 'sample_risk'], 'escalate'],
  ] as const)('%j quá hạn → %s', (reasons, action) => {
    expect(overdueAction({ reasons, dueAt: due, escalatedAt: null }, now)).toBe(action);
  });

  it('chưa tới hạn, hay đã ở chỗ master → không làm gì', () => {
    expect(
      overdueAction(
        { reasons: ['machine_hold'], dueAt: plusHours(now, 1), escalatedAt: null },
        now,
      ),
    ).toBeNull();
    expect(
      overdueAction({ reasons: ['machine_hold'], dueAt: due, escalatedAt: due }, now),
    ).toBeNull();
  });
});

describe('Hàng của master có nhắc hạn', () => {
  const since = at('2026-10-01T10:00:00+07:00');
  const due = (hours: number, remindedAt: Date | null = null) =>
    masterReminderDue({
      atMasterSince: since,
      remindedAt,
      now: plusHours(since, hours),
      afterHours: 72,
    });

  it('73 giờ ở chỗ master → nhắc; 71 giờ → chưa', () => {
    expect(due(73)).toBe(true);
    expect(due(71)).toBe(false);
  });

  it('đã nhắc thì nhắc lại sau một ngày', () => {
    expect(due(73 + 23, plusHours(since, 73))).toBe(false);
    expect(due(73 + 24, plusHours(since, 73))).toBe(true);
  });
});

describe('Cảnh báo khi nhiều việc sắp chạm hạn', () => {
  it('10 việc, 5 sắp chạm hạn → cảnh báo; 4 → không; không có việc → không', () => {
    expect(dueSoonWarning(10, 5)).toBe(true);
    expect(dueSoonWarning(10, 4)).toBe(false);
    expect(dueSoonWarning(0, 0)).toBe(false);
  });
});
