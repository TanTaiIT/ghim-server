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

export type JobSummary = Record<string, number | string | boolean | null>;

/**
 * Điều một lượt việc theo lịch nói về mình (TK 26 luật 2): `partial` = bị cắt giữa chừng, phần còn lại ở lượt sau;
 * không trả gì = xong.
 */
export interface JobOutcome {
  partial?: boolean;
  summary?: JobSummary;
}

export type JobRunStatus = 'done' | 'partial' | 'failed';

export interface JobRunRecord {
  name: JobName;
  status: JobRunStatus;
  startedAt: Date;
  finishedAt: Date;
  summary: JobSummary;
  error: string | null;
}

/** Sổ kết quả lượt chạy — `ops` sở hữu bảng `job_runs`; `createJobs` chỉ ghi. */
export interface JobRunLog {
  record(run: JobRunRecord): Promise<void>;
}

export interface Jobs {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Việc theo lịch cron. Handler là hàm thuần nhận deps lúc khai; kết quả lượt được ghi vào sổ (`JobRunLog`). */
  schedule(
    name: JobName,
    cron: string,
    handler: () => Promise<JobOutcome | void>,
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
const ERROR_MAX_CHARS = 500;

type Registration = () => Promise<void>;

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX_CHARS);

/**
 * Chạy một lượt việc theo lịch và ghi kết quả vào sổ: xong, mới làm được một phần (handler trả `partial`), hay hỏng
 * (handler ném — ghi rồi ném tiếp để pg-boss thử lại). Sổ hỏng không che lỗi của việc, chỉ lên log.
 */
export async function recordedRun(
  name: JobName,
  handler: () => Promise<JobOutcome | void>,
  runLog: JobRunLog | undefined,
  clock: () => Date = () => new Date(),
): Promise<JobOutcome | void> {
  const startedAt = clock();
  const record = async (run: Omit<JobRunRecord, 'name' | 'startedAt' | 'finishedAt'>) => {
    try {
      await runLog?.record({ name, startedAt, finishedAt: clock(), ...run });
    } catch (error) {
      logger.error({ err: error, job: name }, 'Không ghi được kết quả lượt việc');
    }
  };
  try {
    const outcome = await handler();
    await record({
      status: outcome?.partial ? 'partial' : 'done',
      summary: outcome?.summary ?? {},
      error: null,
    });
    return outcome;
  } catch (error) {
    await record({ status: 'failed', summary: {}, error: errorText(error) });
    throw error;
  }
}

/**
 * Việc nền trên chính Postgres (TK 26), một instance cho cả tiến trình: `buildApp` khai việc của
 * từng module, `server.ts` gọi `start()` sau khi dựng app và `stop()` khi tắt. Khai trước
 * `start()` được xếp chờ rồi áp khi start — pg-boss chỉ tạo queue sau khi đã nối DB, nhưng người
 * khai không phải biết điều đó. Chạy nhiều tiến trình sau này không phải đổi gì: pg-boss khoá theo
 * job, không theo tiến trình.
 */
export function createJobs(
  connectionString: string,
  { max, runLog }: { max?: number; runLog?: JobRunLog } = {},
): Jobs {
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
          await recordedRun(name, handler, runLog);
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
