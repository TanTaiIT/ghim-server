import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { getOwn, listingApi, readyDraft, submit } from './listing-http-helpers.js';
import {
  activePhrase,
  codesOf,
  DAY_MS,
  deviceOf,
  LATER,
  markChecked,
  runOf,
  screened,
  tierPort,
} from './screening-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Spec screening/banned-phrases và delta identity/profile qua bàn vận hành thật: master thêm, bật, tắt cụm; lượt gửi kế
 * tiếp so theo phiên bản mới; bật thật cụm mức chắc xếp việc quét lại tin đang hiển thị. So khớp từng chữ đã có unit
 * test (`phrase.calc`). Mỗi ca một cụm riêng — cụm đã bật của ca trước vẫn so ở ca sau.
 */
let app: FastifyInstance;
let jobs: FakeJobs;
let master: TestUser;
let staff: TestUser;

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => LATER, trust: tierPort(new Map()), jobs });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
  staff = await newUser(app);
  await grantStaff(staff.id, ['support']);
});

afterAll(() => app.close());

const phrases = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: object, user = master) =>
  api(app, method, `/ops/screening/phrases${url}`, user.token, body);

const runOfText = async (fields: Record<string, unknown>) =>
  (await screened(app, await newUser(app), fields)).run;

describe('Hai mức, chỉ nhận cụm từ hai chữ trở lên', () => {
  it('master thêm "bán súng" mức chắc: 201, chế độ chạy thử 7 ngày', async () => {
    const res = await phrases('POST', '', { text: 'bán súng', level: 'certain' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      text: 'bán súng',
      level: 'certain',
      mode: 'trial',
      trialEndsAt: new Date(LATER.getTime() + 7 * DAY_MS).toISOString(),
    });
    const again = await phrases('POST', '', { text: 'Ban  SUNG', level: 'ambiguous' });
    expect([again.statusCode, again.json().error.code]).toEqual([409, 'BANNED_PHRASE_EXISTS']);
  });

  it('từ đơn "súng": 400 BANNED_PHRASE_TOO_SHORT; cụm rỗng: 400 VALIDATION_ERROR; staff thêm: 403', async () => {
    const count = await prisma.bannedPhrase.count();
    const single = await phrases('POST', '', { text: 'súng', level: 'certain' });
    expect([single.statusCode, single.json().error.code]).toEqual([400, 'BANNED_PHRASE_TOO_SHORT']);
    const empty = await phrases('POST', '', { text: '   ', level: 'certain' });
    expect([empty.statusCode, empty.json().error.code]).toEqual([400, 'VALIDATION_ERROR']);
    const byStaff = await phrases('POST', '', { text: 'bán dao', level: 'certain' }, staff);
    expect([byStaff.statusCode, byStaff.json().error.code]).toEqual([403, 'FORBIDDEN']);
    expect(await prisma.bannedPhrase.count()).toBe(count);
  });

  it('cụm mơ hồ đang bật trong mô tả: cộng 25, không dính cổng; hai cụm mơ hồ cộng một lần, ghi cả hai', async () => {
    const first = await activePhrase(app, master, 'hàng xách tay', 'ambiguous');
    const second = await activePhrase(app, master, 'giá sốc nhất', 'ambiguous');
    const one = await runOfText({ description: 'Hàng xách tay từ Nhật' });
    expect(one).toMatchObject({ score: 25, outcome: 'pass_full', cause: 'score' });
    const both = await runOfText({ description: 'Hàng xách tay, giá sốc nhất thị trường' });
    expect(both.score).toBe(25);
    expect(both.hits).toEqual([
      { code: 'ambiguous_phrase', weight: 25, mode: 'on', refs: [first, second] },
    ]);
  });
});

describe('So khớp theo ranh giới chữ và ngoại lệ', () => {
  it('cụm đang bật: không dấu và chữ cái tách rời đều trúng; chỉ khớp một phần chữ thì không', async () => {
    await activePhrase(app, master, 'bán mìn');
    expect(codesOf(await runOfText({ description: 'ban min gia re' }))).toEqual(['certain_phrase']);
    expect(codesOf(await runOfText({ description: 'b á n m ì n' }))).toEqual(['certain_phrase']);
    await activePhrase(app, master, 'cần sa');
    expect(codesOf(await runOfText({ description: 'Cần sang nhượng gấp' }))).toEqual([]);
  });

  it('ngoại lệ "bán kiếm gỗ": chỉ có ngoại lệ thì không trúng; còn cụm ở chỗ khác thì trúng; staff thêm ngoại lệ: 403', async () => {
    const id = await activePhrase(app, master, 'bán kiếm', 'certain', ['bán kiếm gỗ']);
    expect(codesOf(await runOfText({ description: 'Bán kiếm gỗ cho bé' }))).toEqual([]);
    expect(codesOf(await runOfText({ description: 'Bán kiếm gỗ, bán kiếm thật' }))).toEqual([
      'certain_phrase',
    ]);
    const byStaff = await phrases('PATCH', `/${id}`, { exceptions: ['bán kiếm nhựa'] }, staff);
    expect(byStaff.statusCode).toBe(403);
  });
});

describe('Cụm mới chạy thử trước khi bật', () => {
  it('cụm mức chắc đang chạy thử: T2 hiện đầy đủ, kết quả ghi lượt trúng chạy thử; bật thật rồi thì giữ', async () => {
    const created = await phrases('POST', '', { text: 'bán lựu đạn', level: 'certain' });
    const id = created.json().data.id as string;
    const trial = await runOfText({ title: 'Bán lựu đạn đồ chơi' });
    expect(trial.outcome).toBe('pass_full');
    expect(trial.hits).toEqual([{ code: 'certain_phrase', weight: 0, mode: 'trial', refs: [id] }]);

    await phrases('POST', `/${id}/activate`, { reason: 'Đợt lừa đảo mới' });
    expect(await runOfText({ title: 'Bán lựu đạn đồ chơi' })).toMatchObject({
      outcome: 'hold',
      cause: 'gate',
    });
  });

  it('bật mã cụm không tồn tại: 404; staff bật: 403', async () => {
    const missing = await phrases('POST', '/00000000-0000-7000-8000-000000000000/activate', {});
    expect([missing.statusCode, missing.json().error.code]).toEqual([404, 'NOT_FOUND']);
    const created = await phrases('POST', '', { text: 'bán chất độc', level: 'certain' });
    const byStaff = await phrases(
      'POST',
      `/${created.json().data.id as string}/activate`,
      {},
      staff,
    );
    expect(byStaff.statusCode).toBe(403);
  });

  it('bật sớm không lý do: 400, cụm vẫn chạy thử; kèm lý do: bật được, nhật ký vận hành ghi lý do', async () => {
    const created = await phrases('POST', '', { text: 'bán tài khoản', level: 'ambiguous' });
    const id = created.json().data.id as string;
    const bare = await phrases('POST', `/${id}/activate`, {});
    expect([bare.statusCode, bare.json().error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect((await prisma.bannedPhrase.findUniqueOrThrow({ where: { id } })).mode).toBe('trial');

    const early = await phrases('POST', `/${id}/activate`, { reason: 'Đợt lừa đảo mới' });
    expect(early.json().data).toMatchObject({ mode: 'on', activationReason: 'Đợt lừa đảo mới' });
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'screening.phrase.activate', targetId: id },
      }),
    ).toMatchObject({ reason: 'Đợt lừa đảo mới', actorId: master.id });
  });
});

describe('Bật thật cụm mức chắc thì quét lại tin đang hiển thị', () => {
  it('tin chứa cụm bị rút về chờ duyệt kèm câu chung; tin không chứa, tin chỉ có ngoại lệ, tin đã bán giữ nguyên', async () => {
    const owner = await newUser(app);
    const hit = (await screened(app, owner, { title: 'Bàn ghế', description: 'Bán thuốc nổ' }))
      .listing;
    const clean = (await screened(app, await newUser(app), { title: 'Ghế đá' })).listing;
    const excepted = (
      await screened(app, await newUser(app), { title: 'Pháo', description: 'Bán thuốc nổ giả' })
    ).listing;
    const seller = await newUser(app);
    const sold = (await screened(app, seller, { title: 'Tủ', description: 'Bán thuốc nổ' }))
      .listing;
    await prisma.listing.update({ where: { id: sold.id }, data: { state: 'sold' } });

    await activePhrase(app, master, 'bán thuốc nổ', 'certain', ['bán thuốc nổ giả']);
    await jobs.runAll();
    await deliverAll(app);

    expect((await getOwn(app, owner, hit.id)).state).toBe('pending');
    const recall = await runOf(hit.id, 'recall');
    expect(recall).toMatchObject({ outcome: 'hold', cause: 'gate' });
    expect(recall.explanation).toEqual({ kind: 'fraud', fixable: [] });
    expect(recall.lookupCode).toMatch(/^S[0-9A-Z]{8}$/);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: clean.id } })).state).toBe(
      'live',
    );
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: excepted.id } })).state).toBe(
      'live',
    );
    const soldView = await listingApi(app, 'GET', `/listings/${sold.id}`, await newUser(app));
    expect([soldView.statusCode, soldView.json().data.state]).toEqual([200, 'sold']);
  });

  it('tin bị rút về rồi người duyệt cho đạt: hiện lại, hạn hiển thị không đổi', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Bán xăng lậu' })).listing;
    await activePhrase(app, master, 'bán xăng lậu');
    await jobs.runAll();
    await deliverAll(app);
    const pending = await getOwn(app, owner, live.id);
    await app.modules.listing.review({
      listingId: live.id,
      version: pending.version,
      arrow: 'approve',
    });
    const back = await getOwn(app, owner, live.id);
    expect(back).toMatchObject({ state: 'live', expiresAt: live.expiresAt });
  });

  it('bật thật cụm mức mơ hồ: không quét — tin đang hiện có chứa cụm giữ nguyên', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Hàng nhái loại một' })).listing;
    await activePhrase(app, master, 'hàng nhái loại', 'ambiguous');
    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('live');
  });
});

describe('Tắt một cụm', () => {
  it('gửi sau khi tắt: hiện đầy đủ; tin đang chờ vì cụm đó vẫn chờ, không tự hiện', async () => {
    const id = await activePhrase(app, master, 'bán ngà voi');
    const owner = await newUser(app);
    const held = await screened(app, owner, { title: 'Bán ngà voi' });
    expect(held.listing.state).toBe('pending');
    expect((await phrases('POST', `/${id}/deactivate`)).json().data.mode).toBe('off');
    expect((await runOfText({ title: 'Bán ngà voi giả' })).outcome).toBe('pass_full');
    expect((await getOwn(app, owner, held.listing.id)).state).toBe('pending');
  });
});

/** Người dùng mới đổi tên — tên người khác thấy, và `/me` của chính chủ. */
const rename = async (displayName: string) => {
  const user = await newUser(app);
  const res = await api(app, 'PATCH', '/me', user.token, { displayName });
  if (res.statusCode !== 200) throw new Error(`Đổi tên hỏng: ${res.body}`);
  const viewer = await newUser(app);
  return {
    publicName: (await api(app, 'GET', `/users/${user.id}`, viewer.token)).json().data
      .displayName as string,
    me: (await api(app, 'GET', '/me', user.token)).json().data as {
      displayName: string;
      nameHidden: boolean;
    },
  };
};

describe('Tên hiển thị qua bộ lọc cụm từ cấm', () => {
  it('tên chứa cụm mức chắc đang bật, kể cả chữ cái tách rời: người khác thấy "Người dùng Ghim", chủ thấy tên mình kèm cờ nhắc', async () => {
    await activePhrase(app, master, 'bán súng hoa cải');
    const named = await rename('Bán Súng Hoa Cải Giá Rẻ');
    expect(named.publicName).toBe('Người dùng Ghim');
    expect(named.me).toMatchObject({ displayName: 'Bán Súng Hoa Cải Giá Rẻ', nameHidden: true });
    expect((await rename('b á n s ú n g h o a c ả i')).publicName).toBe('Người dùng Ghim');
  });

  it('cụm đang chạy thử, cụm mơ hồ, tên bình thường: hồ sơ công khai hiện đúng tên', async () => {
    await phrases('POST', '', { text: 'bán chó cảnh', level: 'certain' });
    await activePhrase(app, master, 'thanh lý gấp', 'ambiguous');
    const names = ['Bán Chó Cảnh', 'Thanh Lý Gấp', 'Chị Lan'];
    const named = await Promise.all(names.map((name) => rename(name)));
    expect(named.map((row) => [row.publicName, row.me.nameHidden])).toEqual(
      names.map((name) => [name, false]),
    );
  });
});

describe('Quét lại lần hai sau thời gian chờ ảnh (fix-audit-image-checks, C11)', () => {
  it('bật cụm mức chắc gửi hai việc quét: ngay, và hẹn sau thời gian chờ ảnh cộng 10 phút', async () => {
    jobs.sent.length = 0;
    await activePhrase(app, master, 'bán mìn tự chế');
    const rescans = jobs.sent.filter((job) => job.name === 'screening.rescan-phrase');
    expect(rescans.map((job) => job.startAfter)).toEqual([
      undefined,
      new Date(LATER.getTime() + 15 * 60_000),
    ]);
    await jobs.runAll();
  });

  it('tin đã kết luận lúc bật mà kết quả chưa tới tin: lượt quét đầu bỏ sót, lượt hai rút về chờ duyệt', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { description: 'Bán ngòi nổ loại cũ' });
    await markChecked(
      draft.images.map((image) => image.id),
      owner.id,
    );
    const sent = await submit(app, owner, draft, deviceOf(owner));
    expect(sent.statusCode, sent.body).toBe(200);
    await activePhrase(app, master, 'bán ngòi nổ');
    await jobs.runAll(LATER);
    await deliverAll(app);
    expect((await getOwn(app, owner, draft.id)).state).toBe('live');

    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, draft.id)).state).toBe('pending');
    expect((await runOf(draft.id, 'recall')).outcome).toBe('hold');
  });

  it('tin bị rút ở lượt đầu rồi người duyệt cho đạt: lượt quét lần hai không rút lại', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Bán kíp nổ' })).listing;
    await activePhrase(app, master, 'bán kíp nổ');
    await jobs.runAll(LATER);
    await deliverAll(app);
    const pending = await getOwn(app, owner, live.id);
    expect(pending.state).toBe('pending');
    await app.modules.listing.review({
      listingId: live.id,
      version: pending.version,
      arrow: 'approve',
    });

    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('live');
    expect(
      await prisma.screeningRun.count({ where: { listingId: live.id, trigger: 'recall' } }),
    ).toBe(1);
  });
});

const rescanJobs = () => jobs.sent.filter((job) => job.name === 'screening.rescan-phrase');

describe('Đổi cụm mức chắc đang bật cũng quét lại (fix-audit-screening-trust, T22)', () => {
  it('nâng cụm đang bật từ mơ hồ lên chắc: gửi hai lượt quét, tin đang hiện chứa cụm bị rút', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Nhận hàng cấm xuất khẩu' })).listing;
    const id = await activePhrase(app, master, 'hàng cấm xuất', 'ambiguous');
    await jobs.runAll();
    jobs.sent.length = 0;

    const raised = await phrases('PATCH', `/${id}`, { level: 'certain' });
    expect(raised.statusCode, raised.body).toBe(200);
    expect(rescanJobs()).toHaveLength(2);
    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('pending');
  });

  it('nới ngoại lệ không quét; bỏ ngoại lệ thì tin chỉ có ngoại lệ bị rút', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Bán dao găm đồ chơi' })).listing;
    const id = await activePhrase(app, master, 'bán dao găm', 'certain', ['bán dao găm đồ chơi']);
    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('live');

    jobs.sent.length = 0;
    await phrases('PATCH', `/${id}`, { exceptions: ['bán dao găm đồ chơi', 'bán dao găm giả'] });
    expect(rescanJobs()).toHaveLength(0);
    await phrases('PATCH', `/${id}`, { exceptions: [] });
    expect(rescanJobs()).toHaveLength(2);
    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('pending');
  });

  it('lượt quét lúc bật bị lỡ, bấm bật lại cụm mức chắc đang bật: quét lại, cụm vẫn bật', async () => {
    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Bán mã độc tống tiền' })).listing;
    const id = await activePhrase(app, master, 'bán mã độc');
    jobs.sent.length = 0;

    const again = await phrases('POST', `/${id}/activate`, {});
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().data.mode).toBe('on');
    expect(rescanJobs()).toHaveLength(2);
    await jobs.runAll();
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('pending');
  });
});
