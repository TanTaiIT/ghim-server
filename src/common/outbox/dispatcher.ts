import type { PrismaClient } from '@prisma/client';

import { logger } from '../../lib/logger.js';
import { sequentially } from '../utils/sequential.js';
import type { OutboxEventType } from './outbox.js';

export interface OutboxEventRef {
  id: string;
  type: string;
}

/**
 * Bên nghe PHẢI idempotent: một sự kiện có thể tới hai lần khi tiến trình chết giữa lúc gọi và lúc
 * đánh dấu. Và KHÔNG dựa vào thứ tự giữa các sự kiện: một sự kiện đang lùi giờ thử lại thì sự kiện
 * tạo sau nó vẫn được phát trước.
 */
export type OutboxHandler = (
  payload: Record<string, unknown>,
  event: OutboxEventRef,
) => Promise<void>;

export interface OutboxDispatcher {
  register(type: OutboxEventType, handler: OutboxHandler): void;
  /** Một lượt: nhận tới 100 sự kiện đã tới giờ, chưa ai giữ. Test gọi thẳng. */
  runOnce(): Promise<{ published: number; failed: number }>;
  start(): void;
  /** Dừng hẹn giờ rồi chờ lượt đang chạy xong — `server.ts` đóng DB sau đó, không giữa một lô. */
  stop(): Promise<void>;
}

const BATCH_SIZE = 100;
/** 10 giây: đủ cho "treo quyền ngay" ở mức con người thấy. */
const INTERVAL_MS = 10_000;
/** Hạn giữ một lô: dài hơn xa một lượt bình thường, ngắn đủ để lô của tiến trình chết sớm được nhận lại. */
const LEASE_SECONDS = 60;
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 3_600_000;
/** Từ lần thử này, lỗi lên `error` thay vì `warn`: người trực cần thấy sự kiện kẹt. */
const ALERT_AFTER_ATTEMPTS = 10;
const ERROR_MAX_CHARS = 500;

/** Chờ trước lần thử kế tiếp, sau lần thất bại thứ `attempts`: 10 giây, 20 giây, 40 giây… trần 1 giờ. */
export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);
}

interface ClaimedEvent {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  next_attempt_at: Date;
  created_at: Date;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const byDueThenCreated = (a: ClaimedEvent, b: ClaimedEvent): number =>
  a.next_attempt_at.getTime() - b.next_attempt_at.getTime() ||
  a.created_at.getTime() - b.created_at.getTime() ||
  a.id.localeCompare(b.id);

/**
 * Bộ phát outbox (design add-platform-roles 7, harden-module-infra 1): nhận lô sự kiện đã tới giờ
 * bằng `FOR UPDATE SKIP LOCKED` kèm hạn giữ — nhiều tiến trình chạy cùng lúc lấy những lô rời nhau
 * — gọi mọi bên nghe của loại đó, đánh dấu `published_at`. Bên nghe ném thì giữ sự kiện, tăng
 * `attempts`, ghi `last_error` và lùi giờ thử lại, để một sự kiện hỏng không chặn sự kiện mới. Không
 * bao giờ bỏ sự kiện. `ops` (đợt 7) nhận lại và mở rộng; hợp đồng bên nghe không đổi.
 */
export function createOutboxDispatcher(prisma: PrismaClient): OutboxDispatcher {
  const handlers = new Map<string, OutboxHandler[]>();
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<unknown> | null = null;

  const claim = async (): Promise<ClaimedEvent[]> => {
    const rows = await prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE outbox_events
         SET locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
       WHERE id IN (
         SELECT id FROM outbox_events
          WHERE published_at IS NULL
            AND next_attempt_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
          ORDER BY next_attempt_at, created_at, id
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, type, payload, attempts, next_attempt_at, created_at`;
    // RETURNING không giữ thứ tự của câu con: xếp lại để bên nghe thấy sự kiện theo giờ hẹn.
    return rows.toSorted(byDueThenCreated);
  };

  const dispatchOne = async (
    event: ClaimedEvent,
    tally: { published: number; failed: number },
  ): Promise<void> => {
    try {
      const payload = isRecord(event.payload) ? event.payload : {};
      await sequentially(handlers.get(event.type) ?? [], (handler) =>
        handler(payload, { id: event.id, type: event.type }),
      );
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date(), lockedUntil: null },
      });
      tally.published += 1;
    } catch (error) {
      tally.failed += 1;
      const attempts = event.attempts + 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError: String(error).slice(0, ERROR_MAX_CHARS),
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
        },
      });
      const context = { err: error, eventId: event.id, type: event.type, attempts };
      if (attempts >= ALERT_AFTER_ATTEMPTS) {
        logger.error(context, 'Sự kiện outbox kẹt: bên nghe lỗi lặp lại');
      } else {
        logger.warn(context, 'Bên nghe outbox lỗi, sẽ thử lại');
      }
    }
  };

  const runOnce = async (): Promise<{ published: number; failed: number }> => {
    const tally = { published: 0, failed: 0 };
    // Lượt trước còn chạy (bên nghe chậm) thì bỏ lượt này, không chồng hai lượt trong một tiến trình.
    if (inFlight) return tally;
    const work = (async () => {
      await sequentially(await claim(), (event) => dispatchOne(event, tally));
    })();
    inFlight = work;
    try {
      await work;
      return tally;
    } finally {
      inFlight = null;
    }
  };

  return {
    register(type, handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void runOnce().catch((error: unknown) =>
          logger.error({ err: error }, 'Lượt phát outbox hỏng'),
        );
      }, INTERVAL_MS);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      // Lỗi của lượt đang chạy đã được `runOnce` / hẹn giờ xử lý; ở đây chỉ chờ nó dừng.
      await inFlight?.catch(() => {});
    },
  };
}
