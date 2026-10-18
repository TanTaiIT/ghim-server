import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ConversationDto } from '../src/modules/messaging/messaging.schema.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
  block,
  codeOf,
  conversationOf,
  conversationsOf,
  dataOf,
  messagesOf,
  opened,
  sendMessage,
  sent,
} from './messaging-helpers.js';
import { aboutAccount, reported, unverifiedUser } from './report-helpers.js';
import { conversationExists, day } from './retention-helpers.js';
import { activePhrase } from './screening-helpers.js';
import { staffOf, struck } from './strike-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec messaging/group-admin-chat qua HTTP, cùng các delta của add-team-conversations chạm hội thoại với quản trị nhóm
 * (người ngoài, bộ lọc, chặn, xoá, đọc chung, thông báo, hạn lưu). Nhóm dựng qua luồng thật (master lập, chủ nhận lời,
 * chủ bổ nhiệm điều hành viên); gậy nặng đi đường thật để vai treo đúng như ngoài đời.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const openGroup = (user: TestUser, groupId: string) =>
  api(app, 'POST', `/groups/${groupId}/conversation`, user.token);
async function groupChat(user: TestUser, groupId: string): Promise<ConversationDto> {
  const res = await openGroup(user, groupId);
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`Mở hội thoại nhóm hỏng: ${res.statusCode} ${res.body}`);
  }
  return dataOf<ConversationDto>(res);
}

let seq = 0;
/** Nhóm có chủ và một điều hành viên cả nhóm, tên riêng mỗi ca. */
async function managedGroup(
  mode: 'public_open' | 'private_invite' = 'public_open',
): Promise<{ group: ActiveGroup; name: string; moderator: TestUser }> {
  seq += 1;
  const name = `Hội Nhiếp ảnh ${seq}`;
  const group = await createActiveGroup(app, { master, mode, name });
  const moderator = await addMember(app, group.groupId);
  await appointModerator(app, group, moderator);
  return { group, name, moderator };
}
const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, category: 'messages' },
    orderBy: { createdAt: 'asc' },
  });
const rename = (groupId: string, name: string) =>
  prisma.group.update({ where: { id: groupId }, data: { name } });
/** Trạng thái nhóm ghi thẳng kèm đúng các cột CHECK của `groups` đòi — ca chỉ bàn về luật hội thoại. */
const lockGroup = (groupId: string) =>
  prisma.group.update({
    where: { id: groupId },
    data: { state: 'locked', lockedAt: TEST_NOW, lockCause: 'ownerless_timeout' },
  });
const makeOwnerless = (groupId: string) =>
  prisma.group.update({
    where: { id: groupId },
    data: { state: 'ownerless', ownerlessSince: TEST_NOW },
  });

describe('Mỗi người dùng một hội thoại với quản trị một nhóm', () => {
  it('thành viên nhắn lần đầu → 201 với quản trị nhóm; mở lại → 200 cùng hội thoại; hai lượt cùng lúc ra một', async () => {
    const { group, name } = await managedGroup();
    const member = await addMember(app, group.groupId);
    const first = await openGroup(member, group.groupId);
    expect(first.statusCode, first.body).toBe(201);
    const conversation = dataOf<ConversationDto>(first);
    expect(conversation).toMatchObject({
      kind: 'group',
      listing: null,
      group: { id: group.groupId, name },
      role: 'buyer',
      counterpart: {
        kind: 'group_admins',
        accountId: null,
        displayName: `Quản trị nhóm «${name}»`,
      },
      canOffer: false,
    });
    const again = await openGroup(member, group.groupId);
    expect([again.statusCode, dataOf<ConversationDto>(again).id]).toEqual([200, conversation.id]);

    const other = await addMember(app, group.groupId);
    const replies = await Promise.all([
      openGroup(other, group.groupId),
      openGroup(other, group.groupId),
    ]);
    expect(new Set(replies.map((res) => dataOf<ConversationDto>(res).id)).size).toBe(1);
  });

  it('người ngoài nhắn quản trị nhóm công khai và nhóm riêng tư (chỉ thấy tên) → 201', async () => {
    const open = await managedGroup('public_open');
    const hidden = await managedGroup('private_invite');
    const outsider = await newUser(app);
    expect((await openGroup(outsider, open.group.groupId)).statusCode).toBe(201);
    expect((await openGroup(outsider, hidden.group.groupId)).statusCode).toBe(201);
  });

  it('bị cấm → 403 GROUP_BANNED; quản trị nhắn nhóm mình → 403 CANNOT_MESSAGE_OWN_GROUP', async () => {
    const { group, moderator } = await managedGroup();
    const banned = await newUser(app);
    expect(
      (await api(app, 'PUT', `/groups/${group.groupId}/bans/${banned.id}`, group.owner.token))
        .statusCode,
    ).toBe(204);
    const refused = await openGroup(banned, group.groupId);
    expect([refused.statusCode, codeOf(refused)]).toEqual([403, 'GROUP_BANNED']);
    const own = await Promise.all(
      [group.owner, moderator].map((admin) => openGroup(admin, group.groupId)),
    );
    expect(own.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [403, 'CANNOT_MESSAGE_OWN_GROUP'],
      [403, 'CANNOT_MESSAGE_OWN_GROUP'],
    ]);
    expect(await prisma.conversation.count({ where: { groupId: group.groupId } })).toBe(0);
  });

  it('nhóm đã đóng, đang tạm khoá → 409 GROUP_NOT_ACTIVE; mã nhóm không có → 404; chưa xác nhận email → 403', async () => {
    const closed = await managedGroup();
    expect(
      (await api(app, 'POST', `/groups/${closed.group.groupId}/close`, closed.group.owner.token))
        .statusCode,
    ).toBe(204);
    const locked = await managedGroup();
    await lockGroup(locked.group.groupId);
    const user = await newUser(app);
    const refused = await Promise.all(
      [closed.group.groupId, locked.group.groupId].map((groupId) => openGroup(user, groupId)),
    );
    expect(refused.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [409, 'GROUP_NOT_ACTIVE'],
      [409, 'GROUP_NOT_ACTIVE'],
    ]);
    const missing = await openGroup(user, '01a1312e-959f-7011-aed7-98a4ad9322d8');
    expect([missing.statusCode, codeOf(missing)]).toEqual([404, 'NOT_FOUND']);
    const unverified = await openGroup(await unverifiedUser(app), locked.group.groupId);
    expect([unverified.statusCode, codeOf(unverified)]).toEqual([403, 'EMAIL_NOT_VERIFIED']);
  });

  it('T0 hết lượt hội thoại mới về tin vẫn mở hội thoại với quản trị nhóm lần đầu', async () => {
    const { group } = await managedGroup();
    const user = await newUser(app);
    const listings = await Promise.all(
      Array.from({ length: 10 }, async () =>
        seedListing(liveListing((await newUser(app)).id, await seedCategory())),
      ),
    );
    await Promise.all(listings.map((listing) => opened(app, user, listing.id)));
    expect((await openGroup(user, group.groupId)).statusCode).toBe(201);
  });
});

describe('Mọi quản trị của nhóm cùng thấy một hội thoại', () => {
  it('chủ nhóm và điều hành viên cùng thấy; điều hành viên trả lời, người dùng thấy, chủ nhóm thấy ai viết', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Cho mình vào nhóm với');
    const lists = await Promise.all(
      [group.owner, moderator].map((admin) => conversationsOf(app, admin)),
    );
    for (const list of lists) {
      const item = list.find((row) => row.id === conversation.id);
      expect(item).toMatchObject({
        role: 'team',
        counterpart: { kind: 'account', accountId: user.id },
        group: { id: group.groupId },
        unreadCount: 1,
      });
    }
    const res = await sendMessage(app, moderator, conversation.id, 'Bạn gửi đơn nhé');
    expect(res.statusCode, res.body).toBe(201);
    expect((await messagesOf(app, user, conversation.id))[0]).toMatchObject({
      body: 'Bạn gửi đơn nhé',
      senderId: null,
      fromMe: false,
    });
    expect((await messagesOf(app, group.owner, conversation.id))[0]?.senderId).toBe(moderator.id);
  });

  it('điều hành viên bị gỡ vai: 404 và mất khỏi danh sách; người được giao vai sau thấy cả tin cũ', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Tin cũ');
    expect(
      (
        await api(
          app,
          'DELETE',
          `/groups/${group.groupId}/moderators/${moderator.id}`,
          group.owner.token,
        )
      ).statusCode,
    ).toBe(204);
    const gone = await conversationOf(app, moderator, conversation.id);
    expect([gone.statusCode, codeOf(gone)]).toEqual([404, 'NOT_FOUND']);
    expect((await conversationsOf(app, moderator)).map((row) => row.id)).not.toContain(
      conversation.id,
    );

    const fresh = await addMember(app, group.groupId);
    await appointModerator(app, group, fresh);
    expect((await messagesOf(app, fresh, conversation.id)).map((m) => m.body)).toEqual(['Tin cũ']);
  });

  it('vai treo vì gậy nặng: gửi tin → 404, không tin nhắn nào được thêm', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    const categoryId = await seedCategory();
    await struck(app, {
      staff: await staffOf(app, [categoryId]),
      poster: moderator,
      categoryId,
      kind: 'severe',
    });
    const res = await sendMessage(app, moderator, conversation.id, 'Mình vẫn trả lời');
    expect([res.statusCode, codeOf(res)]).toEqual([404, 'NOT_FOUND']);
    expect(await messagesOf(app, user, conversation.id)).toEqual([]);
  });

  it('nhóm tạm thời chưa có ai quản trị: tin nhắn vẫn gửi được và chờ', async () => {
    const group = await createActiveGroup(app, { master, name: `Nhóm thiếu chủ ${++seq}` });
    await makeOwnerless(group.groupId);
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    expect((await sendMessage(app, user, conversation.id, 'Có ai không?')).statusCode).toBe(201);
  });
});

describe('Người dùng thấy tên nhóm, không thấy quản trị nào viết', () => {
  it('chủ nhóm trả lời: người dùng thấy "Quản trị nhóm «tên»"; nhóm đổi tên thì thấy tên mới', async () => {
    const { group, name } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, group.owner, conversation.id, 'Chào bạn');
    const [message] = await messagesOf(app, user, conversation.id);
    expect(message).toMatchObject({ senderId: null, fromMe: false });
    expect(dataOf<ConversationDto>(await conversationOf(app, user, conversation.id))).toMatchObject(
      {
        counterpart: { displayName: `Quản trị nhóm «${name}»` },
      },
    );
    await rename(group.groupId, 'Nhiếp ảnh Sài Gòn mới');
    expect(dataOf<ConversationDto>(await conversationOf(app, user, conversation.id))).toMatchObject(
      {
        group: { name: 'Nhiếp ảnh Sài Gòn mới' },
        counterpart: { displayName: 'Quản trị nhóm «Nhiếp ảnh Sài Gòn mới»' },
      },
    );
  });
});

describe('Hội thoại khi nhóm đóng hay người dùng bị cấm', () => {
  it('người dùng rời nhóm: hai bên vẫn nhắn được', async () => {
    const { group } = await managedGroup();
    const member = await addMember(app, group.groupId);
    const conversation = await groupChat(member, group.groupId);
    await prisma.groupMember.delete({
      where: { groupId_accountId: { groupId: group.groupId, accountId: member.id } },
    });
    expect((await sendMessage(app, member, conversation.id, 'Mình rời rồi')).statusCode).toBe(201);
    expect((await sendMessage(app, group.owner, conversation.id, 'Ok bạn')).statusCode).toBe(201);
  });

  it('nhóm đóng: cả hai bên gửi → 409 CONVERSATION_CLOSED, tin cũ vẫn đọc được', async () => {
    const { group } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Trước khi đóng');
    await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token);
    const closedReplies = await Promise.all(
      [user, group.owner].map((sender) =>
        sendMessage(app, sender, conversation.id, 'Sau khi đóng'),
      ),
    );
    expect(closedReplies.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [409, 'CONVERSATION_CLOSED'],
      [409, 'CONVERSATION_CLOSED'],
    ]);
    expect((await messagesOf(app, user, conversation.id)).map((m) => m.body)).toEqual([
      'Trước khi đóng',
    ]);
    expect(dataOf<ConversationDto>(await conversationOf(app, user, conversation.id)).canSend).toBe(
      false,
    );
  });

  it('người dùng bị cấm sau khi đã nhắn: người dùng → 403 GROUP_BANNED; quản trị → 409 CONVERSATION_CLOSED', async () => {
    const { group } = await managedGroup();
    const user = await addMember(app, group.groupId);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Hỏi');
    await api(app, 'PUT', `/groups/${group.groupId}/bans/${user.id}`, group.owner.token);
    const mine = await sendMessage(app, user, conversation.id, 'Sao mình bị cấm?');
    expect([mine.statusCode, codeOf(mine)]).toEqual([403, 'GROUP_BANNED']);
    const theirs = await sendMessage(app, group.owner, conversation.id, 'Giải thích');
    expect([theirs.statusCode, codeOf(theirs)]).toEqual([409, 'CONVERSATION_CLOSED']);
    expect((await messagesOf(app, user, conversation.id)).map((m) => m.body)).toEqual(['Hỏi']);
  });
});

describe('Luật chung của hội thoại với quản trị nhóm', () => {
  it('một người dùng có ba loại hội thoại trong một danh sách', async () => {
    const user = await newUser(app);
    const listing = await seedListing(liveListing((await newUser(app)).id, await seedCategory()));
    await opened(app, user, listing.id);
    await api(app, 'POST', '/me/support/conversation', user.token);
    const { group } = await managedGroup();
    await groupChat(user, group.groupId);
    expect(new Set((await conversationsOf(app, user)).map((row) => row.kind))).toEqual(
      new Set(['listing', 'support', 'group']),
    );
  });

  it('thành viên thường, hay chủ một nhóm khác, mở hội thoại của người khác với quản trị → 404', async () => {
    const { group } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    const plain = await addMember(app, group.groupId);
    const elsewhere = await managedGroup();
    const replies = await Promise.all(
      [plain, elsewhere.group.owner].map((stranger) =>
        conversationOf(app, stranger, conversation.id),
      ),
    );
    expect(replies.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [404, 'NOT_FOUND'],
      [404, 'NOT_FOUND'],
    ]);
  });

  it('điều hành viên trả lời bằng cụm từ cấm mức chắc → 409 MESSAGE_NOT_ALLOWED', async () => {
    await activePhrase(app, master, 'bán tài khoản ngân hàng', 'certain');
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    const res = await sendMessage(app, moderator, conversation.id, 'Bán tài khoản ngân hàng đây');
    expect([res.statusCode, codeOf(res)]).toEqual([409, 'MESSAGE_NOT_ALLOWED']);
    expect(await messagesOf(app, user, conversation.id)).toEqual([]);
  });

  it('chủ nhóm đọc là cả đội đã đọc', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await Promise.all(['Một', 'Hai', 'Ba'].map((body) => sent(app, user, conversation.id, body)));
    expect(
      dataOf<ConversationDto>(await conversationOf(app, moderator, conversation.id)).unreadCount,
    ).toBe(3);
    await api(app, 'POST', `/me/conversations/${conversation.id}/read`, group.owner.token);
    expect(
      dataOf<ConversationDto>(await conversationOf(app, moderator, conversation.id)).unreadCount,
    ).toBe(0);
  });

  it('A đã chặn B, B là điều hành viên nhóm X: A vẫn nhắn quản trị nhóm X', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    await block(app, user, moderator.id);
    const conversation = await groupChat(user, group.groupId);
    expect((await sendMessage(app, user, conversation.id, 'Alo')).statusCode).toBe(201);
  });

  it('người dùng xoá phía mình, quản trị gửi thì hiện lại; chủ nhóm xoá → 403, vẫn trong danh sách của đội', async () => {
    const { group, moderator } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, user.token);
    expect(await conversationsOf(app, user)).toEqual([]);
    await sent(app, moderator, conversation.id, 'Bạn còn cần không?');
    expect((await conversationsOf(app, user)).map((row) => row.id)).toEqual([conversation.id]);

    const refused = await api(
      app,
      'DELETE',
      `/me/conversations/${conversation.id}`,
      group.owner.token,
    );
    expect([refused.statusCode, codeOf(refused)]).toEqual([403, 'FORBIDDEN']);
    expect((await conversationsOf(app, group.owner)).map((row) => row.id)).toContain(
      conversation.id,
    );
  });
});

describe('Thông báo của hội thoại với quản trị nhóm', () => {
  it('quản trị nhận tin của người dùng; người dùng nhận trả lời ký tên nhóm; người trả lời không làm đội nhận thông báo', async () => {
    const { group, name, moderator } = await managedGroup();
    const second = await addMember(app, group.groupId);
    await appointModerator(app, group, second);
    const user = await newUser(app);
    const userName = (await prisma.account.findUniqueOrThrow({ where: { id: user.id } }))
      .displayName;
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Cho mình hỏi');
    await deliverAll(app);
    const boxes = await Promise.all([group.owner, moderator, second].map((admin) => inbox(admin)));
    for (const box of boxes) {
      expect(box).toEqual([
        expect.objectContaining({ category: 'messages', title: `${name} · ${userName}` }),
      ]);
    }
    await sent(app, moderator, conversation.id, 'Bạn hỏi đi');
    await deliverAll(app);
    expect(await inbox(user)).toEqual([
      expect.objectContaining({ category: 'messages', title: `Quản trị nhóm «${name}»` }),
    ]);
    expect(await inbox(group.owner)).toHaveLength(1);
    expect(await inbox(second)).toHaveLength(1);
  });
});

const retention = () => app.modules.ops.runRetention({ budgetMs: 60_000 });

describe('Hạn lưu của hội thoại với quản trị nhóm', () => {
  it('nhóm đóng quá hạn lưu: hội thoại với quản trị bị xoá, trừ hội thoại đang giữ làm bằng chứng', async () => {
    const { group } = await managedGroup();
    const [plain, reportedUser] = [await newUser(app), await newUser(app)];
    const dropped = await groupChat(plain, group.groupId);
    const kept = await groupChat(reportedUser, group.groupId);
    await sent(app, plain, dropped.id, 'Hỏi');
    await sent(app, reportedUser, kept.id, 'Hỏi');
    await reported(app, await newUser(app), aboutAccount(reportedUser.id), 'harassment');
    await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token);
    await deliverAll(app);

    now = day(91);
    await retention();
    expect(await conversationExists(dropped.id)).toBe(false);
    expect(await conversationExists(kept.id)).toBe(true);
  });

  it('hội thoại với đội chỉ xoá hẳn sau 1 năm không ai nhắn — đội không xoá phía mình', async () => {
    const { group } = await managedGroup();
    const user = await newUser(app);
    const conversation = await groupChat(user, group.groupId);
    await sent(app, user, conversation.id, 'Hỏi');
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, user.token);
    now = day(200);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(true);
    now = day(400);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(false);
  });
});
