import type { JobRun, Prisma, PrismaClient } from '@prisma/client';

import type { JobRunLog, JobRunRecord } from '../../lib/jobs.js';

export type Tx = Prisma.TransactionClient;
export type { JobRun };

/** `ops` sở hữu `job_runs` và việc dọn `outbox_events` đã phát; transaction trùm ẩn danh hoá cũng mở từ đây. */
export interface OpsRepository extends JobRunLog {
  record(run: JobRunRecord): Promise<void>;
  listRuns(query: { name?: string | undefined; limit: number }): Promise<JobRun[]>;
  deleteRunsBefore(startedBefore: Date): Promise<number>;
  /** `published_at < x` loại sẵn dòng chưa phát (NULL không nhỏ hơn gì) — sự kiện chưa phát không bao giờ bị xoá. */
  deletePublishedOutboxBefore(publishedBefore: Date): Promise<number>;
  /** Một transaction cho ẩn danh hoá qua ba module — mỗi module ghi bảng của mình trong đó (design mục 5). */
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
}

export function createOpsRepository(prisma: PrismaClient): OpsRepository {
  return {
    async record(run) {
      await prisma.jobRun.create({
        data: {
          name: run.name,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          summary: run.summary,
          error: run.error,
        },
        select: { id: true },
      });
    },

    listRuns: ({ name, limit }) =>
      prisma.jobRun.findMany({
        where: name === undefined ? {} : { name },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),

    async deleteRunsBefore(startedBefore) {
      const { count } = await prisma.jobRun.deleteMany({
        where: { startedAt: { lt: startedBefore } },
      });
      return count;
    },

    async deletePublishedOutboxBefore(publishedBefore) {
      const { count } = await prisma.outboxEvent.deleteMany({
        where: { publishedAt: { lt: publishedBefore } },
      });
      return count;
    },

    inTransaction: (write) => prisma.$transaction((tx) => write(tx)),
  };
}
