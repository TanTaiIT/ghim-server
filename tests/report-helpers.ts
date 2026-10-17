import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';

import type { ListingTrustPort, TrustTier } from '../src/modules/listing/listing.ports.js';
import { prisma } from './db-helpers.js';
import { api, type TestUser } from './group-helpers.js';
import { DEVICE, listingApi } from './listing-http-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';

/*
 * Dựng nhanh cho test báo cáo (add-reports): gửi báo cáo qua HTTP thật, đọc báo cáo / việc từ DB, nhận và quyết việc ở
 * bàn vận hành. Mức tin cậy theo từng người (mặc định T1) để kiểm điều kiện "từ T1" của ngưỡng tạm ẩn.
 */
export type Subject =
  { kind: 'listing'; listingId: string } | { kind: 'account'; accountId: string };

export const aboutListing = (listingId: string): Subject => ({ kind: 'listing', listingId });
export const aboutAccount = (accountId: string): Subject => ({ kind: 'account', accountId });

export const report = (
  app: FastifyInstance,
  user: TestUser | null,
  subject: Subject,
  category = 'fraud',
  device: string | null = DEVICE,
): Promise<LightMyRequestResponse> =>
  listingApi(app, 'POST', '/reports', user, { subject, category }, device);

/** Lượt báo phải thành công (201) — ném kèm body để thấy ngay lý do khi dựng tình huống hỏng. */
export async function reported(
  app: FastifyInstance,
  user: TestUser,
  subject: Subject,
  category = 'fraud',
  device: string | null = DEVICE,
): Promise<void> {
  const res = await report(app, user, subject, category, device);
  if (res.statusCode !== 201) throw new Error(`Báo cáo hỏng: ${res.statusCode} ${res.body}`);
}

export const openReportOf = (subject: Subject) =>
  prisma.report.findFirst({
    where:
      subject.kind === 'listing'
        ? { listingId: subject.listingId, status: 'open' }
        : { accountId: subject.accountId, subjectKind: 'account', status: 'open' },
    include: { entries: true },
  });

export const openTaskOf = (subject: Subject) =>
  prisma.reviewTask.findFirstOrThrow({
    where:
      subject.kind === 'listing'
        ? { listingId: subject.listingId, status: 'open' }
        : { accountId: subject.accountId, status: 'open' },
  });

export const opsQueueIds = async (app: FastifyInstance, user: TestUser): Promise<string[]> =>
  (
    (await api(app, 'GET', '/ops/review/tasks', user.token)).json() as {
      data: { items: { id: string }[] };
    }
  ).data.items.map((item) => item.id);

export const groupQueueIds = async (
  app: FastifyInstance,
  user: TestUser,
  groupId: string,
): Promise<string[]> =>
  (
    (await api(app, 'GET', `/groups/${groupId}/review/tasks`, user.token)).json() as {
      data: { items: { id: string }[] };
    }
  ).data.items.map((item) => item.id);

export const opsClaim = (app: FastifyInstance, user: TestUser, taskId: string) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);

export const opsDecide = (app: FastifyInstance, user: TestUser, taskId: string, body: object) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, user.token, body);

/** Nhận rồi quyết ở bàn vận hành — nhận hỏng thì ném, để ca test chỉ kiểm lượt quyết. */
export async function decideOps(
  app: FastifyInstance,
  user: TestUser,
  subject: Subject,
  body: object,
): Promise<LightMyRequestResponse> {
  const task = await openTaskOf(subject);
  const claim = await opsClaim(app, user, task.id);
  if (claim.statusCode !== 200)
    throw new Error(`Nhận việc hỏng: ${claim.statusCode} ${claim.body}`);
  return opsDecide(app, user, task.id, body);
}

/** Người dùng chưa xác nhận email — phiên vẫn hợp lệ. */
export async function unverifiedUser(app: FastifyInstance): Promise<TestUser> {
  const account = await seedAccount({ status: 'pending_verification' });
  return { id: account.id, email: account.email, token: await tokenFor(app, account.id) };
}

/** Mức tin cậy theo người, mặc định T1, không chặn lượt gửi nào. */
export function tieredTrust(tiers: Map<string, TrustTier>): ListingTrustPort {
  const tierOf = (accountId: string) => Promise.resolve(tiers.get(accountId) ?? 'T1');
  return {
    tierOf,
    tierIn: (_tx, accountId) => tierOf(accountId),
    assertCanSubmit: () => Promise.resolve(),
    strikePointsIn: () => Promise.resolve(0),
    strikePointsOf: () => Promise.resolve(0),
    struckAccounts: () => Promise.resolve(new Set<string>()),
  };
}

export const setScore = (accountId: string, score: number, suspendedUntil: Date | null = null) =>
  prisma.reporterScore.upsert({
    where: { accountId },
    create: { accountId, score, suspendedUntil },
    update: { score, suspendedUntil },
  });

export const scoreOf = async (accountId: string): Promise<number> =>
  (await prisma.reporterScore.findUnique({ where: { accountId } }))?.score ?? 0;
