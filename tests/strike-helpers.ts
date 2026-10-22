import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Strike, StrikeKind } from '@prisma/client';

import { prisma } from './db-helpers.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { machineHold, type OwnListing, submitted } from './listing-http-helpers.js';
import { aboutListing, decideOps, opsClaim, opsDecide } from './report-helpers.js';
import { grantStaff } from './test-app.js';

/*
 * Dựng nhanh cho test gậy (add-strikes): gậy chỉ sinh từ quyết định vi phạm của người, nên mọi ca đi qua bàn vận hành
 * thật với `trust` thật; đọc gậy và việc từ DB.
 */
export type Res = { statusCode: number; body: string; json(): unknown };
export const codeOf = (res: Res): string => (res.json() as { error: { code: string } }).error.code;
export const dataOf = <T>(res: Res): T => (res.json() as { data: T }).data;

export async function staffOf(
  app: FastifyInstance,
  categoryIds: string[],
  scopes: 'user_reports'[] = [],
): Promise<TestUser> {
  const user = await newUser(app);
  await grantStaff(user.id, scopes, categoryIds);
  return user;
}

/** Điều đầu tiên đang dùng của quy định sàn — test gọi `ensureRuleArticles` ở `beforeAll`. */
export const anyArticle = () =>
  prisma.ruleArticle.findFirstOrThrow({ where: { active: true }, orderBy: { sort: 'asc' } });

export const violation = async (kind: StrikeKind = 'normal') => ({
  outcome: 'violation',
  strike: { kind, ruleArticleId: (await anyArticle()).id },
});

export const strikesOf = (accountId: string): Promise<Strike[]> =>
  prisma.strike.findMany({ where: { accountId }, orderBy: { issuedAt: 'asc' } });

export const strikeTaskOf = (strikeId: string) =>
  prisma.reviewTask.findFirst({ where: { strikeId }, orderBy: { createdAt: 'desc' } });

/** Payload các sự kiện outbox một loại mà `payload[field]` là `value` — trong file, sự kiện của các ca trước còn đó. */
export async function eventsOf(
  type: string,
  field: string,
  value: string,
): Promise<Record<string, unknown>[]> {
  const rows = await prisma.outboxEvent.findMany({
    where: { type, payload: { path: [field], equals: value } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.payload as Record<string, unknown>);
}

/** Nhận rồi quyết việc về gậy ở bàn vận hành — nhận hỏng thì ném, để ca test chỉ kiểm lượt quyết. */
export async function decideStrike(
  app: FastifyInstance,
  user: TestUser,
  strikeId: string,
  body: object,
): Promise<LightMyRequestResponse> {
  const task = await prisma.reviewTask.findFirstOrThrow({ where: { strikeId, status: 'open' } });
  const claim = await opsClaim(app, user, task.id);
  if (claim.statusCode !== 200)
    throw new Error(`Nhận việc hỏng: ${claim.statusCode} ${claim.body}`);
  return opsDecide(app, user, task.id, body);
}

/** Tin máy giữ đã có việc hàng 0. */
export async function heldListing(
  app: FastifyInstance,
  poster: TestUser,
  fields: Record<string, unknown>,
): Promise<OwnListing> {
  const held = await machineHold(app, poster, await submitted(app, poster, fields));
  await deliverAll(app);
  return held;
}

/**
 * Gậy qua đường có thật: staff từ chối tin máy giữ ở mức vi phạm. Trả gậy và tin; sự kiện đã giao cho bên nghe (khoá,
 * treo quyền, mất vai, tính lại mức…).
 */
export async function struck(
  app: FastifyInstance,
  input: { staff: TestUser; poster: TestUser; categoryId: string; kind: StrikeKind },
): Promise<{ strike: Strike; listing: OwnListing }> {
  const listing = await heldListing(app, input.poster, { categoryId: input.categoryId });
  const res = await decideOps(
    app,
    input.staff,
    aboutListing(listing.id),
    await violation(input.kind),
  );
  if (res.statusCode !== 200) throw new Error(`Ra gậy hỏng: ${res.statusCode} ${res.body}`);
  const { strikeId } = dataOf<{ strikeId: string | null }>(res);
  if (!strikeId) throw new Error('Quyết định vi phạm không trả gậy');
  await deliverAll(app);
  const strike = await prisma.strike.findUniqueOrThrow({ where: { id: strikeId } });
  return { strike, listing };
}

export const myStrikes = (app: FastifyInstance, user: TestUser) =>
  api(app, 'GET', '/me/strikes', user.token);

export const appeal = (
  app: FastifyInstance,
  user: TestUser,
  strikeId: string,
  statement = 'Tôi không vi phạm điều này',
) => api(app, 'POST', `/me/strikes/${strikeId}/appeal`, user.token, { statement });

export const amnesty = (app: FastifyInstance, user: TestUser, accountId: string, body: object) =>
  api(app, 'POST', `/ops/trust/accounts/${accountId}/amnesty`, user.token, body);
