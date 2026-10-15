import type { JobName, Jobs } from '../../src/lib/jobs.js';

export interface SentJob {
  name: JobName;
  data: object;
  startAfter?: Date | undefined;
}

export interface FakeJobs extends Jobs {
  readonly sent: SentJob[];
  readonly schedules: { name: JobName; cron: string }[];
  /**
   * Chạy mọi việc đã xếp qua handler đã khai, theo thứ tự xếp — test gọi khi muốn "thư đi". Có `at` thì việc hẹn
   * `startAfter` sau mốc đó nằm lại chờ lượt sau.
   */
  runAll(at?: Date): Promise<void>;
}

/** Bản giả trong bộ nhớ: không Postgres, không cron; test tự quyết lúc nào việc chạy. */
export function createFakeJobs(): FakeJobs {
  const sent: SentJob[] = [];
  const schedules: { name: JobName; cron: string }[] = [];
  const handlers = new Map<JobName, (data: never) => Promise<void>>();

  return {
    sent,
    schedules,
    start: async () => {},
    stop: async () => {},
    async schedule(name, cron, handler) {
      schedules.push({ name, cron });
      handlers.set(name, handler);
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
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`Không có handler cho việc ${job.name}`);
      await handler(job.data as never);
      await this.runAll(at);
    },
  };
}
