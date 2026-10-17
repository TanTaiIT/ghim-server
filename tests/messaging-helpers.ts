import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import type { ConversationDto, MessageDto } from '../src/modules/messaging/messaging.schema.js';
import { api, type TestUser } from './group-helpers.js';

/* Dựng nhanh cho test nhắn tin (add-messaging): mọi lượt đi qua HTTP thật; đọc dòng từ DB khi cần kiểm phía trong. */
export type Res = { statusCode: number; body: string; json(): unknown };
export const codeOf = (res: Res): string => (res.json() as { error: { code: string } }).error.code;
export const dataOf = <T>(res: Res): T => (res.json() as { data: T }).data;

export const openConversation = (
  app: FastifyInstance,
  user: TestUser | null,
  listingId: string,
): Promise<LightMyRequestResponse> =>
  api(app, 'POST', `/listings/${listingId}/conversation`, user?.token);

/** Mở hội thoại phải thành công (201 mới hay 200 cũ) — ném kèm body khi dựng tình huống hỏng. */
export async function opened(
  app: FastifyInstance,
  user: TestUser,
  listingId: string,
): Promise<ConversationDto> {
  const res = await openConversation(app, user, listingId);
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`Mở hội thoại hỏng: ${res.statusCode} ${res.body}`);
  }
  return dataOf<ConversationDto>(res);
}

export const sendMessage = (
  app: FastifyInstance,
  user: TestUser,
  conversationId: string,
  body: string,
): Promise<LightMyRequestResponse> =>
  api(app, 'POST', `/me/conversations/${conversationId}/messages`, user.token, { body });

export async function sent(
  app: FastifyInstance,
  user: TestUser,
  conversationId: string,
  body: string,
): Promise<MessageDto> {
  const res = await sendMessage(app, user, conversationId, body);
  if (res.statusCode !== 201) throw new Error(`Gửi tin hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<MessageDto>(res);
}

export const conversationOf = (app: FastifyInstance, user: TestUser, conversationId: string) =>
  api(app, 'GET', `/me/conversations/${conversationId}`, user.token);

export async function conversationsOf(
  app: FastifyInstance,
  user: TestUser,
): Promise<ConversationDto[]> {
  const res = await api(app, 'GET', '/me/conversations', user.token);
  if (res.statusCode !== 200) throw new Error(`Danh sách hội thoại hỏng: ${res.body}`);
  return dataOf<{ items: ConversationDto[] }>(res).items;
}

export async function messagesOf(
  app: FastifyInstance,
  user: TestUser,
  conversationId: string,
): Promise<MessageDto[]> {
  const res = await api(app, 'GET', `/me/conversations/${conversationId}/messages`, user.token);
  if (res.statusCode !== 200) throw new Error(`Đọc tin nhắn hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<{ items: MessageDto[] }>(res).items;
}

export const block = (app: FastifyInstance, user: TestUser, accountId: string) =>
  api(app, 'POST', '/me/blocks', user.token, { accountId });
export const unblock = (app: FastifyInstance, user: TestUser, accountId: string) =>
  api(app, 'DELETE', `/me/blocks/${accountId}`, user.token);
