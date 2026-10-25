import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { MessageDto } from '../src/modules/messaging/messaging.schema.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { firstByteAt, requestUpload } from './media-helpers.js';
import { codeOf, dataOf, messagesOf, opened, sent } from './messaging-helpers.js';
import { aboutAccount, openTaskOf } from './report-helpers.js';
import { uploadWith } from './storage-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Delta của add-message-images qua HTTP, trên kho thật và `sharp` thật: ảnh tải với chủ là hội thoại, gửi kèm hay không
 * kèm chữ, qua luật chất lượng của ảnh tin, hai bên (và người xử khi bị báo) thấy, đi theo hội thoại khi xoá. Luật chất
 * lượng bật bằng bàn vận hành, trả về chạy thử sau mỗi ca: các file cùng worker dùng chung DB.
 */
let app: FastifyInstance;
let master: TestUser;
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp({ screening: interimScreening });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
});

afterEach(async () => {
  await setRule('image_too_small', 'trial');
});

afterAll(() => app.close());

const setRule = async (code: string, mode: 'on' | 'trial') => {
  const res = await api(app, 'PATCH', `/ops/screening/rules/${code}`, master.token, { mode });
  expect(res.statusCode, res.body).toBe(200);
};

// ── ẢNH ──────────────────────────────────────────────────────────────────────────────────────────

/** Nhiễu xám đủ nét, đủ sáng; byte đầu của PNG giống nhau nên phân biệt ảnh bằng mã, không bằng ruột. */
async function pngOf(size = 512): Promise<Uint8Array> {
  let state = ((seq += 1) * 2_654_435_761) >>> 0;
  const data = Buffer.from(
    Array.from({ length: size * size }, () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return 60 + ((state >>> 24) % 141);
    }),
  );
  return new Uint8Array(
    await sharp(data, { raw: { width: size, height: size, channels: 1 } })
      .png()
      .toBuffer(),
  );
}

/** Tải bytes lên kho như app, chủ là hội thoại — trả mã ảnh. */
async function uploadTo(user: TestUser, conversationId: string, bytes?: Uint8Array) {
  const body = bytes ?? (await pngOf());
  const granted = await requestUpload(app, user, {
    ownerKind: 'conversation',
    ownerId: conversationId,
    contentType: 'image/png',
    byteSize: body.length,
  });
  if (granted.statusCode !== 201) {
    throw new Error(`Xin tải hỏng: ${granted.statusCode} ${granted.body}`);
  }
  const { imageId, upload } = granted.json().data as {
    imageId: string;
    upload: { url: string; headers: Record<string, string> };
  };
  const put = await uploadWith(upload, body);
  if (put.status !== 200) throw new Error(`Tải lên kho hỏng: ${put.status}`);
  return imageId;
}

const post = (user: TestUser, conversationId: string, body: object) =>
  api(app, 'POST', `/me/conversations/${conversationId}/messages`, user.token, body);

async function talking() {
  const [owner, shopper] = [await newUser(app), await newUser(app)];
  const listing = await seedListing(liveListing(owner.id, await seedCategory()));
  const conversation = await opened(app, shopper, listing.id);
  return { owner, shopper, conversation };
}

const idsOf = (message: MessageDto | undefined) => message?.images.map((image) => image.id);
const messageCount = (conversationId: string) =>
  prisma.message.count({ where: { conversationId } });

// ── CA ───────────────────────────────────────────────────────────────────────────────────────────

describe('Gửi ảnh trong hội thoại về tin', () => {
  it('người mua gửi hai ảnh kèm chữ; người bán gửi riêng một ảnh; cả hai thấy đúng thứ tự, đường xem mở được', async () => {
    const { owner, shopper, conversation } = await talking();
    const first = await uploadTo(shopper, conversation.id);
    const second = await uploadTo(shopper, conversation.id);
    const res = await post(shopper, conversation.id, {
      body: 'Ảnh vết xước đây',
      imageIds: [first, second],
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(idsOf(dataOf<MessageDto>(res))).toEqual([first, second]);

    const reply = await uploadTo(owner, conversation.id);
    const only = await post(owner, conversation.id, { imageIds: [reply] });
    expect(only.statusCode, only.body).toBe(201);
    expect(dataOf<MessageDto>(only)).toMatchObject({ body: '', kind: 'text' });
    await deliverAll(app);
    const notes = await prisma.notification.findMany({
      where: { recipientId: shopper.id, category: 'messages' },
    });
    expect(notes.map((note) => note.body)).toEqual(['Đã gửi 1 ảnh']);

    const seen = await messagesOf(app, owner, conversation.id);
    expect(seen.map(idsOf)).toEqual([[reply], [first, second]]);
    expect(await firstByteAt(seen[1]?.images[0]?.url ?? '')).toBe(0x89);
    const listed = (await api(app, 'GET', '/me/conversations', shopper.token)).json().data.items;
    expect(listed[0]?.lastMessage.images.map((image: { id: string }) => image.id)).toEqual([reply]);
    const rows = await prisma.image.findMany({ where: { id: { in: [first, second, reply] } } });
    expect(rows.every((row) => row.confirmedAt !== null && row.ownerKind === 'conversation')).toBe(
      true,
    );
  });

  it('người ngoài hội thoại xin tải → 404; người trong hội thoại → 201 kèm cạnh ngắn tối thiểu', async () => {
    const { shopper, conversation } = await talking();
    const outsider = await newUser(app);
    const body = { ownerKind: 'conversation', ownerId: conversation.id };
    expect((await requestUpload(app, outsider, body)).statusCode).toBe(404);
    const granted = await requestUpload(app, shopper, body);
    expect(granted.statusCode, granted.body).toBe(201);
    expect(granted.json().data.minShortSide).toBe(480);
  });

  it('ảnh của hội thoại khác, của người kia, ảnh đã gửi, quá 4 ảnh, tin trống: không tin nào được ghi', async () => {
    const { owner, shopper, conversation } = await talking();
    const other = await talking();
    const elsewhere = await uploadTo(other.shopper, other.conversation.id);
    const theirs = await uploadTo(owner, conversation.id);
    const used = await uploadTo(shopper, conversation.id);
    await sent(app, shopper, conversation.id, 'Chào bạn');
    expect((await post(shopper, conversation.id, { imageIds: [used] })).statusCode).toBe(201);
    const before = await messageCount(conversation.id);

    const foreign = await Promise.all(
      [[elsewhere], [theirs], [used]].map((imageIds) =>
        post(shopper, conversation.id, { body: 'Xem ảnh', imageIds }),
      ),
    );
    expect(foreign.map(codeOf)).toEqual(Array(3).fill('IMAGE_NOT_IN_STORAGE'));
    const five = await Promise.all(
      Array.from({ length: 5 }, () => uploadTo(shopper, conversation.id)),
    );
    const invalid = await Promise.all(
      [{ imageIds: five }, { body: '   ' }, {}].map((body) => post(shopper, conversation.id, body)),
    );
    expect(invalid.map(codeOf)).toEqual(Array(3).fill('VALIDATION_ERROR'));
    expect(await messageCount(conversation.id)).toBe(before);
  });
});

describe('Luật chất lượng của ảnh tin áp cho ảnh tin nhắn', () => {
  it('ảnh hỏng luôn bị chặn, nói ảnh thứ mấy; ảnh nhỏ gửi được khi luật chạy thử, bị chặn khi luật bật', async () => {
    const { shopper, conversation } = await talking();
    const good = await uploadTo(shopper, conversation.id);
    const broken = await uploadTo(shopper, conversation.id, new Uint8Array(randomBytes(4096)));
    const res = await post(shopper, conversation.id, { imageIds: [good, broken] });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'MESSAGE_IMAGE_REJECTED',
      message: 'Ảnh 2 không mở được. Xoá ảnh đó rồi tải ảnh khác.',
    });

    const small = await uploadTo(shopper, conversation.id, await pngOf(200));
    const trial = await post(shopper, conversation.id, { imageIds: [small] });
    expect(trial.statusCode, trial.body).toBe(201);

    await setRule('image_too_small', 'on');
    const tiny = await uploadTo(shopper, conversation.id, await pngOf(200));
    const blocked = await post(shopper, conversation.id, { body: 'Ảnh nhỏ', imageIds: [tiny] });
    expect(blocked.statusCode, blocked.body).toBe(400);
    expect(blocked.json().error.message).toBe('Ảnh 1 quá nhỏ. Thay bằng ảnh chụp rõ hơn.');
    expect(await messageCount(conversation.id)).toBe(1);
  });
});

describe('Hội thoại với một đội', () => {
  it('quản trị nhóm nhận ảnh của người dùng và gửi ảnh lại dưới tên nhóm', async () => {
    const { groupId, owner } = await createActiveGroup(app);
    const member = await addMember(app, groupId);
    const open = await api(app, 'POST', `/groups/${groupId}/conversation`, member.token);
    const conversationId = (open.json().data as { id: string }).id;
    const image = await uploadTo(member, conversationId);
    expect((await post(member, conversationId, { imageIds: [image] })).statusCode).toBe(201);
    const answer = await uploadTo(owner, conversationId);
    expect((await post(owner, conversationId, { imageIds: [answer] })).statusCode).toBe(201);
    const seen = await messagesOf(app, member, conversationId);
    expect(seen.map(idsOf)).toEqual([[answer], [image]]);
    expect(seen[0]?.senderId).toBeNull();
  });

  it('staff hỗ trợ thấy ảnh người dùng gửi trên bàn vận hành; staff trả lời chỉ bằng chữ', async () => {
    const [user, staff] = [await newUser(app), await newUser(app)];
    await grantStaff(staff.id, ['support'], []);
    const open = await api(app, 'POST', '/me/support/conversation', user.token);
    const conversationId = (open.json().data as { id: string }).id;
    const image = await uploadTo(user, conversationId);
    expect(
      (await post(user, conversationId, { body: 'Lỗi này', imageIds: [image] })).statusCode,
    ).toBe(201);
    const desk = `/ops/support/conversations/${conversationId}/messages`;
    const items = dataOf<{ items: MessageDto[] }>(await api(app, 'GET', desk, staff.token)).items;
    expect(items.map(idsOf)).toEqual([[image]]);
    const withImages = await api(app, 'POST', desk, staff.token, {
      body: 'Đã nhận',
      imageIds: [image],
    });
    expect(withImages.statusCode).toBe(400);
    expect(codeOf(withImages)).toBe('VALIDATION_ERROR');
    const grant = await requestUpload(app, staff, {
      ownerKind: 'conversation',
      ownerId: conversationId,
    });
    expect(grant.statusCode).toBe(404);
  });
});

describe('Người xử và hạn lưu', () => {
  it('hội thoại bị báo: người xử thấy ảnh trong bản ghi', async () => {
    const safety = await newUser(app);
    await grantStaff(safety.id, ['user_reports'], []);
    const { owner, shopper, conversation } = await talking();
    const image = await uploadTo(owner, conversation.id);
    expect((await post(owner, conversation.id, { imageIds: [image] })).statusCode).toBe(201);
    const report = await api(
      app,
      'POST',
      `/me/conversations/${conversation.id}/reports`,
      shopper.token,
      {
        category: 'harassment',
      },
    );
    expect(report.statusCode, report.body).toBe(201);
    await deliverAll(app);
    const task = await openTaskOf(aboutAccount(owner.id));
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, safety.token);
    const messages = detail.json().data.conversations[0].messages as MessageDto[];
    expect(messages.map(idsOf)).toEqual([[image]]);
    expect(await firstByteAt(messages[0]?.images[0]?.url ?? '')).toBe(0x89);
  });

  it('hội thoại xoá hẳn kéo ảnh theo: dòng và tệp; hội thoại mất mà ảnh còn thì lượt đối chiếu dọn', async () => {
    const { shopper, conversation } = await talking();
    const image = await uploadTo(shopper, conversation.id);
    const sentImage = dataOf<MessageDto>(
      await post(shopper, conversation.id, { imageIds: [image] }),
    );
    const url = sentImage.images[0]?.url ?? '';
    expect(await app.modules.messaging.deleteConversations([conversation.id])).toBe(1);
    expect(await prisma.image.count({ where: { id: image } })).toBe(0);
    expect(await firstByteAt(url)).toBeNull();

    const later = await talking();
    const left = await uploadTo(later.shopper, later.conversation.id);
    expect(
      (await post(later.shopper, later.conversation.id, { imageIds: [left] })).statusCode,
    ).toBe(201);
    await prisma.conversation.delete({ where: { id: later.conversation.id } });
    const result = await app.modules.media.reconcile({ budgetMs: 60_000 });
    expect(result.ownerGone).toBeGreaterThanOrEqual(1);
    expect(await prisma.image.count({ where: { id: left } })).toBe(0);
  });
});
