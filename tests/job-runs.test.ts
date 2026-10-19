import { describe, expect, it } from 'vitest';

import { type JobRunRecord, recordedRun } from '../src/lib/jobs.js';

/* TK 26 luật 2 "làm dở thì phải nói ra": mọi lượt việc theo lịch vào sổ — xong, mới làm được một phần, hay hỏng. */
const T0 = new Date('2026-10-10T03:45:00+07:00');
const T1 = new Date('2026-10-10T03:46:00+07:00');

function logOf() {
  const runs: JobRunRecord[] = [];
  return { runs, record: async (run: JobRunRecord) => void runs.push(run) };
}

describe('recordedRun', () => {
  it('handler không trả gì → "xong"; trả partial → "mới làm được một phần" kèm tóm tắt', async () => {
    const log = logOf();
    let tick = 0;
    const clock = () => (tick++ === 0 ? T0 : T1);
    await recordedRun('ops.thu', async () => {}, log, clock);
    expect(log.runs).toEqual([
      {
        name: 'ops.thu',
        status: 'done',
        startedAt: T0,
        finishedAt: T1,
        summary: {},
        error: null,
      },
    ]);

    const outcome = await recordedRun(
      'ops.thu',
      async () => ({ partial: true, summary: { drafts: 500, next: 'mistake' } }),
      log,
    );
    expect(outcome).toMatchObject({ partial: true });
    expect(log.runs[1]).toMatchObject({
      status: 'partial',
      summary: { drafts: 500, next: 'mistake' },
      error: null,
    });
  });

  it('handler ném → ghi "hỏng" kèm thông điệp rồi ném tiếp để pg-boss thử lại', async () => {
    const log = logOf();
    await expect(
      recordedRun(
        'ops.thu',
        async () => {
          throw new Error('DB đi vắng');
        },
        log,
      ),
    ).rejects.toThrow('DB đi vắng');
    expect(log.runs[0]).toMatchObject({ status: 'failed', error: 'DB đi vắng', summary: {} });
  });

  it('sổ hỏng không che lỗi của việc và không làm việc hỏng theo', async () => {
    const broken = {
      record: async () => {
        throw new Error('sổ hỏng');
      },
    };
    await expect(recordedRun('ops.thu', async () => ({}), broken)).resolves.toEqual({});
    await expect(recordedRun('ops.thu', async () => {}, undefined)).resolves.toBeUndefined();
  });
});
