import { PgBoss } from 'pg-boss';

import { logger } from './logger.js';

/** `<module>.<việc>` — module khai việc là chủ của tên, như bảng (CLAUDE.md luật 11). */
export type JobName = `${string}.${string}`;

export interface JobScheduleOptions {
  /**
   * Khoá chống chạy chồng; mặc định là tên việc, tức mỗi việc theo lịch chỉ có một lượt đang
   * chờ hoặc đang chạy — một lượt dọn kéo dài qua mốc kế tiếp thì mốc đó bị bỏ, không xếp hàng.
   */
  singletonKey?: string;
  /**
   * Múi giờ đánh giá cron. Mặc định Asia/Ho_Chi_Minh: "nhắc lúc 9 giờ sáng" là giờ của người
   * dùng, không phải UTC (CLAUDE.md luật 24).
   */
  tz?: string;
}

export interface JobWorkOptions {
  /** Số lần thử lại khi handler ném; mặc định 3, lùi dần. */
  retryLimit?: number;
  /** Số việc cùng loại chạy song song trong một tiến trình; mặc định 1. */
  concurrency?: number;
}

export interface JobSendOptions {
  /** Không chạy trước mốc này. */
  startAfter?: Date;
}

export interface Jobs {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Việc theo lịch cron. Handler là hàm thuần nhận deps lúc khai. */
  schedule(
    name: JobName,
    cron: string,
    handler: () => Promise<void>,
    options?: JobScheduleOptions,
  ): Promise<void>;
  /**
   * Việc theo sự kiện: `send(name, data)` xếp một lượt, handler chạy với thử lại theo options. `startAfter` hẹn lượt
   * chạy (quét lại cụm từ lần hai — fix-audit-image-checks).
   */
  work<T extends object>(
    name: JobName,
    handler: (data: T) => Promise<void>,
    options?: JobWorkOptions,
  ): Promise<void>;
  send<T extends object>(name: JobName, data: T, options?: JobSendOptions): Promise<void>;
}

/**
 * Schema riêng, không nằm trong `public`: `prisma migrate` và `db:drift` không thấy nó, pg-boss tự
 * tạo và tự nâng cấp bảng của mình khi `start()`.
 */
const SCHEMA = 'pgboss';
const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';
const DEFAULT_RETRY_LIMIT = 3;
/** Ngắn hơn `SHUTDOWN_TIMEOUT_MS` của server.ts, để còn chỗ đóng Prisma trước khi bị thoát cưỡng bức. */
const STOP_TIMEOUT_MS = 5_000;

type Registration = () => Promise<void>;

/**
 * Việc nền trên chính Postgres (TK 26), một instance cho cả tiến trình: `buildApp` khai việc của
 * từng module, `server.ts` gọi `start()` sau khi dựng app và `stop()` khi tắt. Khai trước
 * `start()` được xếp chờ rồi áp khi start — pg-boss chỉ tạo queue sau khi đã nối DB, nhưng người
 * khai không phải biết điều đó. Chạy nhiều tiến trình sau này không phải đổi gì: pg-boss khoá theo
 * job, không theo tiến trình.
 */
export function createJobs(connectionString: string, { max }: { max?: number } = {}): Jobs {
  const boss = new PgBoss({
    connectionString,
    schema: SCHEMA,
    ...(max === undefined ? {} : { max }),
  });
  let started = false;
  const pending: Registration[] = [];

  // Không ai nghe 'error' thì EventEmitter ném nó thành uncaught exception — một lượt mất kết
  // nối DB thoáng qua của việc nền sẽ hạ cả HTTP.
  boss.on('error', (error) => logger.error({ err: error }, 'pg-boss'));

  const register = async (registration: Registration): Promise<void> => {
    if (started) await registration();
    else pending.push(registration);
  };

  return {
    async start() {
      await boss.start();
      started = true;
      await Promise.all(pending.splice(0).map((registration) => registration()));
    },

    async stop() {
      if (!started) return;
      started = false;
      // graceful: đợi việc đang chạy xong trong hạn; quá hạn thì buông — pg-boss giao lại việc
      // đó cho lần khởi động sau, nên không mất việc, chỉ chạy lại.
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
    },

    schedule: (name, cron, handler, options = {}) =>
      register(async () => {
        await boss.createQueue(name);
        await boss.work(name, async () => {
          await handler();
        });
        await boss.schedule(name, cron, null, {
          tz: options.tz ?? DEFAULT_TZ,
          singletonKey: options.singletonKey ?? name,
        });
      }),

    work: <T extends object>(
      name: JobName,
      handler: (data: T) => Promise<void>,
      options: JobWorkOptions = {},
    ) =>
      register(async () => {
        await boss.createQueue(name, {
          retryLimit: options.retryLimit ?? DEFAULT_RETRY_LIMIT,
          retryBackoff: true,
        });
        await boss.work<T>(name, { localConcurrency: options.concurrency ?? 1 }, async (jobs) => {
          await Promise.all(jobs.map((job) => handler(job.data)));
        });
      }),

    async send(name, data, options) {
      if (!started) throw new Error(`Jobs chưa start — không xếp việc ${name} được`);
      await boss.send(name, data, options?.startAfter ? { startAfter: options.startAfter } : {});
    },
  };
}
