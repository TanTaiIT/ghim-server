import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
import { seedCategory } from './listing-helpers.js';
import { getOwn, readyDraft, submit } from './listing-http-helpers.js';
import { grantStaff } from './test-app.js';
import {
  activePhrase,
  codesOf,
  deviceOf,
  LATER,
  MILLION,
  resubmitted,
  screened,
  tierPort,
  uniqueHash,
} from './screening-helpers.js';
import { sequentially } from '../src/common/utils/sequential.js';
import { buildTestApp } from './test-app.js';

/*
 * Spec screening/hard-gates qua lượt gửi thật: cổng cứng, luôn duyệt tay, đánh dấu theo thiết bị, dò cổng cứng → thời
 * gian chờ (design mục 5 bước 5). Ảnh trùng ở đây dựng bằng mã băm ghi sẵn; đường băm ảnh thật ở screening-images.
 */
const HOUR_MS = 3_600_000;
const at = (hours: number) => new Date(LATER.getTime() + hours * HOUR_MS);

let now = LATER;
let app: FastifyInstance;
let master: TestUser;
let capped: string;
const tiers = new Map<string, TrustTier>();
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: tierPort(tiers) });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
  capped = await seedCategory({ priceCap: 60_000_000n });
});

beforeEach(() => {
  now = LATER;
});

afterAll(() => app.close());

const userAt = async (tier: TrustTier): Promise<TestUser> => {
  const user = await newUser(app);
  tiers.set(user.id, tier);
  return user;
};

/** Tin vượt trần danh mục — một lượt dính cổng cứng; tiêu đề mỗi lượt một khác để không thành "trùng tin của mình". */
const overCap = (user: TestUser) => {
  seq += 1;
  return screened(app, user, {
    categoryId: capped,
    price: 65 * MILLION,
    title: `Tủ lạnh số ${seq}`,
  });
};

const sharedDevice = () => `may-chung-${(seq += 1)}`;

/** Mỗi tiêu đề một tài khoản mới đăng từ máy này, lần lượt — tài khoản đăng sau đó là tài khoản kế tiếp trên máy. */
const crowd = (device: string, titles: string[]): Promise<void> =>
  sequentially(titles, async (title) => {
    await screened(app, await userAt('T2'), { title }, { device });
  });

const cooldownOf = (accountId: string) =>
  prisma.screeningCooldown.findUnique({ where: { accountId } });

describe('Tin dính cổng cứng luôn giữ cho người', () => {
  it('T3 dùng lại ảnh của tài khoản khác: giữ; dùng lại ảnh của chính mình thì không', async () => {
    const hash = uniqueHash();
    await screened(app, await userAt('T2'), {}, { hashOf: () => hash });
    const { run } = await screened(app, await userAt('T3'), {}, { hashOf: () => hash });
    expect(run).toMatchObject({ outcome: 'hold', cause: 'gate' });
    expect(codesOf(run)).toEqual(['duplicate_image']);

    const own = uniqueHash();
    const owner = await userAt('T2');
    await screened(app, owner, { title: 'Ghế xoay' }, { hashOf: () => own });
    const again = await screened(app, owner, { title: 'Bàn làm việc' }, { hashOf: () => own });
    expect(again.run.outcome).toBe('pass_full');
  });

  it('T2 gửi tin "chỉ thành viên" chứa cụm từ cấm mức chắc: giữ', async () => {
    await activePhrase(app, master, 'bán súng săn');
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    tiers.set(member.id, 'T2');
    const { run } = await screened(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
      title: 'Bán súng săn cũ',
    });
    expect(run).toMatchObject({ outcome: 'hold', cause: 'gate' });
  });

  it('giá 65 triệu ở danh mục trần 60 triệu: dính "giá vượt trần"; đúng 60 triệu thì không', async () => {
    const over = await overCap(await userAt('T2'));
    expect(codesOf(over.run)).toEqual(['price_over_cap']);
    expect(over.listing.state).toBe('pending');
    const exact = await screened(app, await userAt('T2'), {
      categoryId: capped,
      price: 60 * MILLION,
    });
    expect(exact.run.outcome).toBe('pass_full');
  });
});

describe('Danh mục luôn duyệt tay', () => {
  it('T3 gửi tin không trúng gì vào danh mục luôn duyệt tay: giữ; "chỉ thành viên" của T2 cũng giữ', async () => {
    const pets = await seedCategory({ alwaysManual: true });
    expect((await screened(app, await userAt('T3'), { categoryId: pets })).run).toMatchObject({
      outcome: 'hold',
      cause: 'always_manual',
    });
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const member = await addMember(app, group.groupId);
    tiers.set(member.id, 'T2');
    const { run } = await screened(app, member, {
      categoryId: pets,
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(run.cause).toBe('always_manual');
  });

  it('rủi ro cao không bật luôn duyệt tay: không giữ vì danh mục, T2 hiện đầy đủ', async () => {
    const watches = await seedCategory({ riskLevel: 'high' });
    expect((await screened(app, await userAt('T2'), { categoryId: watches })).run).toMatchObject({
      outcome: 'pass_full',
      score: 20,
    });
  });

  it('tin luôn duyệt tay ghi số Zalo vẫn được chấm đủ: ghi "liên hệ ngoài sàn" và điểm 20', async () => {
    const pets = await seedCategory({ alwaysManual: true });
    const { run } = await screened(app, await userAt('T2'), {
      categoryId: pets,
      description: 'Liên hệ Zalo 0912 345 678',
    });
    expect(run).toMatchObject({ outcome: 'hold', cause: 'always_manual', score: 20 });
    expect(codesOf(run)).toEqual(['off_platform_contact']);
  });
});

describe('Tài khoản bị đánh dấu theo thiết bị', () => {
  it('tài khoản thứ tư trên một máy: tin được nhận và giữ; gỡ đánh dấu thì tin đang chờ vẫn chờ, lượt sau được chấm như thường', async () => {
    const device = sharedDevice();
    await crowd(device, ['Áo khoác', 'Giày chạy', 'Mũ bảo hiểm']);
    const fourth = await userAt('T2');
    const held = await screened(app, fourth, { title: 'Ba lô' }, { device });
    expect(held.run).toMatchObject({ outcome: 'hold', cause: 'device' });
    expect(held.listing.state).toBe('pending');

    // Đồng hồ test đứng yên: gỡ phải nằm sau các lượt đăng thì miễn trừ mới có nghĩa.
    now = at(1);
    const support = await newUser(app);
    await grantStaff(support.id, ['support']);
    const flag = await prisma.accountFlag.findFirstOrThrow({
      where: { accountId: fourth.id, clearedAt: null },
    });
    const cleared = await api(app, 'POST', `/ops/flags/${flag.lookupCode}/clear`, support.token, {
      reason: 'Máy mua lại',
    });
    expect(cleared.statusCode).toBe(204);
    await deliverAll(app);
    expect((await getOwn(app, fourth, held.listing.id)).state).toBe('pending');
    const next = await screened(app, fourth, { title: 'Đèn bàn' }, { device });
    expect(next.run).toMatchObject({ outcome: 'pass_full', cause: 'score' });
  });

  it('tài khoản bị đánh dấu gửi vào nhóm "chỉ thành viên" một tin không trúng gì: giữ', async () => {
    const device = sharedDevice();
    await crowd(device, ['Sách giáo khoa', 'Bút máy', 'Thước kẻ']);
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    tiers.set(member.id, 'T2');
    const { run } = await screened(
      app,
      member,
      { placement: 'members_only', groupId: group.groupId, title: 'Cặp sách' },
      { device },
    );
    expect(run.cause).toBe('device');
  });

  it('dùng máy của tài khoản đang bị khoá (lần đầu đăng trên máy sau lúc khoá): giữ', async () => {
    const device = sharedDevice();
    const locked = await userAt('T2');
    await screened(app, locked, { title: 'Điện thoại cũ' }, { device });
    await api(app, 'POST', `/ops/accounts/${locked.id}/lock`, master.token, { reason: 'Lừa đảo' });
    await deliverAll(app);
    now = at(1);
    const { run } = await screened(app, await userAt('T2'), { title: 'Máy ảnh' }, { device });
    expect(run).toMatchObject({ outcome: 'hold', cause: 'device' });
  });
});

describe('Dò cổng cứng thì vào thời gian chờ', () => {
  it('lượt dính cổng cứng thứ ba trong 20 giờ: thời gian chờ 24 giờ — chặn tin mới (429), không chặn sửa', async () => {
    const user = await userAt('T2');
    await overCap(user);
    now = at(10);
    await overCap(user);
    now = at(20);
    const third = await overCap(user);
    expect(await cooldownOf(user.id)).toMatchObject({ until: at(44) });
    expect(tiers.get(user.id)).toBe('T2');

    const draft = await readyDraft(app, user, { title: 'Máy giặt' });
    const blocked = await submit(app, user, draft, deviceOf(user));
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatchObject({
      code: 'SUBMISSION_COOLDOWN',
      details: { retryAt: at(44).toISOString() },
    });
    expect((await getOwn(app, user, draft.id)).state).toBe('draft');
    expect(blocked.body).not.toMatch(/trần|cổng/);

    const edited = await resubmitted(app, user, third.listing, { price: 50 * MILLION });
    expect(edited.run.outcome).toBe('pass_full');

    now = at(45);
    expect((await submit(app, user, draft, deviceOf(user))).statusCode).toBe(200);
  });

  it('hai lượt dính cổng rồi một lượt sạch: không vào thời gian chờ', async () => {
    const user = await userAt('T2');
    await overCap(user);
    await overCap(user);
    await screened(app, user, { title: 'Tivi 43 inch' });
    expect(await cooldownOf(user.id)).toBeNull();
  });

  it('lượt thứ nhất cách lượt thứ ba hơn 24 giờ: không vào thời gian chờ', async () => {
    const user = await userAt('T2');
    await overCap(user);
    now = at(13);
    await overCap(user);
    now = at(25);
    await overCap(user);
    expect(await cooldownOf(user.id)).toBeNull();
  });

  it('chỉ cổng cứng mới tính là dò: ba tin luôn duyệt tay, hay ba tin bị giữ theo thiết bị, không vào thời gian chờ', async () => {
    const pets = await seedCategory({ alwaysManual: true });
    const manual = await userAt('T2');
    await sequentially(['Chó con', 'Mèo con', 'Chim cảnh'], async (title) => {
      await screened(app, manual, { categoryId: pets, title });
    });
    expect(await cooldownOf(manual.id)).toBeNull();

    const device = sharedDevice();
    await crowd(device, ['Áo len', 'Khăn quàng', 'Găng tay']);
    const flagged = await userAt('T2');
    const causes: (string | null)[] = [];
    await sequentially(['Ô dù', 'Áo mưa', 'Ủng cao su'], async (title) => {
      causes.push((await screened(app, flagged, { title }, { device })).run.cause);
    });
    expect(causes).toEqual(['device', 'device', 'device']);
    expect(await cooldownOf(flagged.id)).toBeNull();
  });

  it('một lượt trúng hai cổng đếm một lần; sửa rồi gửi lại vẫn dính thì đếm thêm', async () => {
    await activePhrase(app, master, 'hàng cấm nhập');
    const user = await userAt('T2');
    const both = await screened(app, user, {
      categoryId: capped,
      price: 65 * MILLION,
      title: 'Hàng cấm nhập khẩu',
    });
    expect(codesOf(both.run)).toEqual(['certain_phrase', 'price_over_cap']);
    const second = await overCap(user);
    expect(await cooldownOf(user.id)).toBeNull();

    await resubmitted(app, user, second.listing, { title: 'Tủ lạnh hai cánh' });
    expect(await cooldownOf(user.id)).not.toBeNull();
  });
});
