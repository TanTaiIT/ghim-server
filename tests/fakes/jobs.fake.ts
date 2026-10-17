import {
  type JobName,
  type JobOutcome,
  type JobRunRecord,
  type Jobs,
  recordedRun,
} from '../../src/lib/jobs.js';

export interface SentJob {
  name: JobName;
  data: object;
  startAfter?: Date | undefined;
}

export interface FakeJobs extends Jobs {
  readonly sent: SentJob[];
  readonly schedules: { name: JobName; cron: string }[];
  /** Sổ kết quả lượt việc theo lịch, như bảng `job_runs` — chỉ `runScheduled` ghi. */
  readonly runs: JobRunRecord[];
  /**
   * Chạy mọi việc đã xếp qua handler đã khai, theo thứ tự xếp — test gọi khi muốn "thư đi". Có `at` thì việc hẹn
   * `startAfter` sau mốc đó nằm lại chờ lượt sau.
   */
  runAll(at?: Date): Promise<void>;
  /** Chạy một việc theo lịch như pg-boss tới giờ: qua `recordedRun`, kết quả vào `runs`. */
  runScheduled(name: JobName): Promise<JobOutcome | void>;
}

/** Bản giả trong bộ nhớ: không Postgres, không cron; test tự quyết lúc nào việc chạy. */
export function createFakeJobs(): FakeJobs {
  const sent: SentJob[] = [];
  const schedules: { name: JobName; cron: string }[] = [];
  const runs: JobRunRecord[] = [];
  const handlers = new Map<JobName, (data: never) => Promise<void>>();
  const scheduled = new Map<JobName, () => Promise<JobOutcome | void>>();

  return {
    sent,
    schedules,
    runs,
    start: async () => {},
    stop: async () => {},
    async schedule(name, cron, handler) {
      schedules.push({ name, cron });
      scheduled.set(name, handler);
    },
    async work(name, handler) {
      handlers.set(name, handler as (data: never) => Promise<void>);
    },
    async send(name, data, options) {
      sent.push({ name, data, startAfter: options?.startAfter });
    },
    // Tuần tự và lấy từng việc một: handler có thể xếp thêm việc, và việc đó cũng phải chạy.
    async runAll(at) {
      const index = sent.findIndex((job) => !at || !job.startAfter || job.startAfter <= at);
      if (index < 0) return;
      const [job] = sent.splice(index, 1);
      if (!job) return;
      // Test xếp tay một việc theo lịch (`send` tên lịch rồi `runAll`) — chạy như pg-boss tới giờ, vào sổ `runs`.
      const scheduledHandler = scheduled.get(job.name);
      if (scheduledHandler) {
        await recordedRun(job.name, scheduledHandler, {
          record: async (run) => void runs.push(run),
        });
      } else {
        const handler = handlers.get(job.name);
        if (!handler) throw new Error(`Không có handler cho việc ${job.name}`);
        await handler(job.data as never);
      }
      await this.runAll(at);
    },
    runScheduled(name) {
      const handler = scheduled.get(name);
      if (!handler) throw new Error(`Không có lịch cho việc ${name}`);
      return recordedRun(name, handler, { record: async (run) => void runs.push(run) });
    },
  };
}
