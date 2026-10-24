import { describe, expect, it } from 'vitest';

import type {
  MatrixContext,
  NoticeDraft,
  Payload,
  StrikeNotice,
} from '../src/modules/notification/notification.matrix.js';
import { TRUST_MATRIX } from '../src/modules/notification/notification.trust-matrix.js';
import { submissionCooldown } from '../src/modules/screening/screening.shared.js';

/*
 * Ma trận N49–N58 (change add-trust-notices) — test thuần với ngữ cảnh giả: ai nhận, nhóm "mức tin cậy và gậy", nhắc
 * hay không, câu nhắc không có điều luật hay ngày, nội dung trong app có đủ. Luồng thật ở
 * `notification-trust.http.test.ts`.
 */
const OWNER = '0199a000-0000-7000-8000-0000000000b1';
const STRIKE = '0199a000-0000-7000-8000-0000000000c1';
const SECOND = '0199a000-0000-7000-8000-0000000000c2';
const LISTING = '0199a000-0000-7000-8000-0000000000d1';

const strikeOf = (over: Partial<StrikeNotice> = {}): StrikeNotice => ({
  accountId: OWNER,
  kind: 'normal',
  status: 'active',
  points: 1,
  ruleCode: 'Q3',
  ruleText: 'Không đăng tin sai sự thật về món đồ',
  expiresAt: '2027-01-20T03:00:00.000Z',
  appealUntil: '2026-11-05T03:00:00.000Z',
  listingId: LISTING,
  ...over,
});

const unused = () => Promise.reject(new Error('ma trận gậy không được hỏi điều này'));
const contextWith = (
  known: {
    strikes?: Record<string, StrikeNotice>;
    titles?: Record<string, string>;
    live?: string[];
    points?: number;
  } = {},
): MatrixContext => ({
  group: unused,
  isMember: unused,
  isBanned: unused,
  managers: unused,
  moderators: unused,
  owner: unused,
  names: unused,
  unitName: unused,
  announcement: unused,
  pendingCount: unused,
  listingTargets: unused,
  masterIds: unused,
  machineNotice: unused,
  messagePreview: unused,
  listingTitles: (ids) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => (known.titles?.[id] ? [[id, known.titles[id]] as const] : []))),
    ),
  strike: (id) => Promise.resolve(known.strikes?.[id] ?? null),
  standing: () => Promise.resolve({ points: known.points ?? 0 }),
  postingLockPoints: () => 3,
  groupHeldNotice: unused,
  liveAccounts: (ids) =>
    Promise.resolve(new Set(ids.filter((id) => (known.live ?? [OWNER]).includes(id)))),
});

const one = async (type: string, payload: Payload, ctx: MatrixContext): Promise<NoticeDraft> => {
  const handler = TRUST_MATRIX[type];
  if (!handler) throw new Error(`không có dòng cho ${type}`);
  const { drafts } = await handler(payload, ctx);
  expect(drafts).toHaveLength(1);
  return drafts[0] as NoticeDraft;
};
const none = async (type: string, payload: Payload, ctx: MatrixContext) => {
  const handler = TRUST_MATRIX[type];
  if (!handler) throw new Error(`không có dòng cho ${type}`);
  expect((await handler(payload, ctx)).drafts).toEqual([]);
};

describe('N49 — nhận gậy', () => {
  const issued = { strikeId: STRIKE, accountId: OWNER, inherited: false };

  it('gậy thường về tin: có nhắc, ký "Ghim"; câu nhắc nêu tin, không có điều luật hay ngày; trong app đủ điều, hạn', async () => {
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strikeOf() }, titles: { [LISTING]: 'Xe đạp cũ' } }),
    );
    expect(draft).toMatchObject({
      recipients: [OWNER],
      category: 'trust_strikes',
      type: 'trust.strike.issued',
      title: 'Ghim',
      alertable: true,
      groupId: null,
      body: 'Bạn nhận một cảnh cáo liên quan tới tin «Xe đạp cũ».',
      data: { strikeId: STRIKE, listingId: LISTING },
    });
    expect(draft.body).not.toMatch(/Q3|2027|2026/);
    expect(draft.detail).toBe(
      'Điều Q3: Không đăng tin sai sự thật về món đồ. Cảnh cáo 1 điểm, hết hạn ngày 20/01/2027. ' +
        'Đủ 3 điểm vi phạm thì tạm dừng đăng tin mới. Khiếu nại được tới ngày 05/11/2026.',
    );
  });

  it('điều do master soạn đã có dấu chấm cuối: không thành ".." (gặp trên dev 22/10/2026)', async () => {
    const strike = strikeOf({
      ruleText: 'Không đăng bán hàng hoá, dịch vụ pháp luật cấm mua bán.',
    });
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strike } }),
    );
    expect(draft.detail).toMatch(
      /^Điều Q3: Không đăng bán hàng hoá, dịch vụ pháp luật cấm mua bán\. Cảnh cáo 1 điểm/,
    );
    expect(draft.detail).not.toContain('..');
  });

  it('gậy nặng nêu 2 điểm và ngày hết hạn của gậy nặng', async () => {
    const strike = strikeOf({ kind: 'severe', points: 2, expiresAt: '2027-04-20T03:00:00.000Z' });
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strike }, titles: { [LISTING]: 'Xe đạp cũ' } }),
    );
    expect(draft.body).toBe('Bạn nhận một cảnh cáo nặng liên quan tới tin «Xe đạp cũ».');
    expect(draft.detail).toContain('Cảnh cáo nặng 2 điểm, hết hạn ngày 20/04/2027.');
  });

  it('gậy từ báo cáo về người (không có tin): không nêu tin, vẫn có điều luật và hạn', async () => {
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strikeOf({ listingId: null }) } }),
    );
    expect(draft.body).toBe('Bạn nhận một cảnh cáo.');
    expect(draft.data).toEqual({ strikeId: STRIKE, listingId: null });
    expect(draft.detail).toContain('Điều Q3');
  });

  it('gậy nghiêm trọng: tài khoản bị khoá, chờ master quyết, không ngày hết hạn, khiếu nại 30 ngày', async () => {
    const strike = strikeOf({
      kind: 'serious',
      points: 0,
      expiresAt: null,
      appealUntil: '2026-11-21T03:00:00.000Z',
    });
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strike } }),
    );
    expect(draft.body).toBe('Tài khoản bị khoá vì một vi phạm nghiêm trọng.');
    expect(draft.detail).toBe(
      'Điều Q3: Không đăng tin sai sự thật về món đồ. Vi phạm nghiêm trọng đang chờ master quyết, chưa có ngày hết hạn. ' +
        'Khiếu nại được tới ngày 21/11/2026.',
    );
  });

  it('tin đã xoá hẳn: vẫn báo gậy, không nêu và không mở tin', async () => {
    const draft = await one(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strikeOf() } }),
    );
    expect(draft.body).toBe('Bạn nhận một cảnh cáo.');
    expect(draft.data.listingId).toBeNull();
  });

  it('không dòng nào: tài khoản đã xoá, gậy kế thừa, gậy đã huỷ lúc gửi, gậy không còn', async () => {
    await none(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strikeOf() }, live: [] }),
    );
    await none(
      'trust.strike.issued',
      { ...issued, inherited: true },
      contextWith({ strikes: { [STRIKE]: strikeOf() } }),
    );
    await none(
      'trust.strike.issued',
      issued,
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'cancelled' }) } }),
    );
    await none('trust.strike.issued', issued, contextWith());
  });
});

describe('N50 — gậy kế thừa', () => {
  it('hai gậy còn hiệu lực: một dòng có nhắc nêu số gậy và hạn từng gậy, không nêu tài khoản trước', async () => {
    const draft = await one(
      'trust.strike.inherited',
      { accountId: OWNER, strikeIds: [STRIKE, SECOND] },
      contextWith({
        strikes: {
          [STRIKE]: strikeOf({ listingId: null }),
          [SECOND]: strikeOf({
            listingId: null,
            kind: 'severe',
            points: 2,
            expiresAt: '2027-04-20T03:00:00.000Z',
          }),
        },
      }),
    );
    expect(draft).toMatchObject({
      recipients: [OWNER],
      type: 'trust.strike.inherited',
      alertable: true,
      body: 'Tài khoản mang theo 2 cảnh cáo còn hiệu lực.',
      detail: 'Một cảnh cáo, hết hạn ngày 20/01/2027. Một cảnh cáo nặng, hết hạn ngày 20/04/2027.',
    });
  });

  it('mọi gậy đã hết hạn hay đã huỷ lúc gửi: không dòng nào', async () => {
    await none(
      'trust.strike.inherited',
      { accountId: OWNER, strikeIds: [STRIKE] },
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'expired' }) } }),
    );
  });
});

describe('N51 — kết quả khiếu nại', () => {
  it('thắng: có nhắc, gậy đã huỷ, tin được khôi phục', async () => {
    const draft = await one(
      'trust.appeal.decided',
      { strikeId: STRIKE, accountId: OWNER, verdict: 'won' },
      contextWith({
        strikes: { [STRIKE]: strikeOf({ status: 'cancelled' }) },
        titles: { [LISTING]: 'Xe đạp cũ' },
      }),
    );
    expect(draft).toMatchObject({
      type: 'trust.appeal.decided',
      alertable: true,
      body: 'Khiếu nại được chấp nhận — cảnh cáo đã xoá.',
      detail: 'Tin «Xe đạp cũ» được khôi phục.',
    });
  });

  it('thua: có nhắc, gậy vẫn hết hạn đúng ngày cũ', async () => {
    const draft = await one(
      'trust.appeal.decided',
      { strikeId: STRIKE, accountId: OWNER, verdict: 'lost' },
      contextWith({ strikes: { [STRIKE]: strikeOf() } }),
    );
    expect(draft).toMatchObject({
      body: 'Khiếu nại không được chấp nhận.',
      detail: 'Cảnh cáo vẫn hết hạn ngày 20/01/2027.',
    });
  });

  it('kết quả lạ hay gậy không còn: không dòng nào', async () => {
    await none(
      'trust.appeal.decided',
      { strikeId: STRIKE, accountId: OWNER, verdict: 'pending' },
      contextWith({ strikes: { [STRIKE]: strikeOf() } }),
    );
    await none('trust.appeal.decided', { strikeId: STRIKE, verdict: 'won' }, contextWith());
  });
});

describe('N52 — gậy huỷ ngoài khiếu nại', () => {
  it('ân xá: có nhắc, không nêu lý do ân xá; tin được khôi phục', async () => {
    const draft = await one(
      'trust.strike.cancelled',
      { strikeId: STRIKE, accountId: OWNER, kind: 'normal', listingId: LISTING, cause: 'amnesty' },
      contextWith({
        strikes: { [STRIKE]: strikeOf({ status: 'cancelled' }) },
        titles: { [LISTING]: 'Xe đạp cũ' },
      }),
    );
    expect(draft).toMatchObject({
      type: 'trust.strike.cancelled',
      alertable: true,
      body: 'Một cảnh cáo của bạn đã được xoá.',
      detail: 'Tin «Xe đạp cũ» được khôi phục.',
    });
  });

  it('master huỷ gậy nghiêm trọng: tài khoản đã mở khoá', async () => {
    const draft = await one(
      'trust.strike.cancelled',
      {
        strikeId: STRIKE,
        accountId: OWNER,
        kind: 'serious',
        listingId: null,
        cause: 'serious_cancel',
      },
      contextWith({
        strikes: { [STRIKE]: strikeOf({ kind: 'serious', status: 'cancelled', listingId: null }) },
      }),
    );
    expect(draft.detail).toBe('Tài khoản đã mở khoá.');
  });

  it('huỷ vì khiếu nại thắng: không dòng nào — N51 đã nói', async () => {
    await none(
      'trust.strike.cancelled',
      { strikeId: STRIKE, accountId: OWNER, kind: 'normal', listingId: LISTING, cause: 'appeal' },
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'cancelled' }) } }),
    );
  });
});

const serious = (over: Partial<StrikeNotice> = {}) =>
  contextWith({
    strikes: { [STRIKE]: strikeOf({ kind: 'serious', points: 0, listingId: null, ...over }) },
  });

describe('N53, N54 — master quyết gậy nghiêm trọng, gỡ khoá vĩnh viễn', () => {
  it('khoá vĩnh viễn', async () => {
    const draft = await one(
      'trust.strike.decided',
      { strikeId: STRIKE, accountId: OWNER, decision: 'permanent' },
      serious({ status: 'permanent', expiresAt: null }),
    );
    expect(draft).toMatchObject({
      type: 'trust.strike.decided',
      body: 'Tài khoản bị khoá vĩnh viễn.',
    });
  });

  it('hạ thành gậy nặng: mở khoá, ngày hết hạn mới; hạ muộn mà đã hết hạn thì nói đã hết hạn', async () => {
    const downgraded = await one(
      'trust.strike.decided',
      { strikeId: STRIKE, accountId: OWNER, decision: 'downgrade' },
      serious({ kind: 'severe', points: 2, expiresAt: '2027-04-20T03:00:00.000Z' }),
    );
    expect(downgraded).toMatchObject({
      body: 'Tài khoản đã mở khoá; vi phạm nghiêm trọng đã hạ thành cảnh cáo nặng.',
      detail: 'Cảnh cáo nặng 2 điểm, hết hạn ngày 20/04/2027.',
    });
    const late = await one(
      'trust.strike.decided',
      { strikeId: STRIKE, accountId: OWNER, decision: 'downgrade' },
      serious({ kind: 'severe', points: 2, status: 'expired' }),
    );
    expect(late.detail).toBe('Cảnh cáo nặng này đã hết hạn.');
  });

  it('gỡ khoá vĩnh viễn khi xem lại: N54', async () => {
    const draft = await one(
      'trust.strike.decided',
      { strikeId: STRIKE, accountId: OWNER, decision: 'lifted' },
      serious({ status: 'lifted', expiresAt: null }),
    );
    expect(draft).toMatchObject({
      type: 'trust.strike.lifted',
      body: 'Khoá vĩnh viễn đã được gỡ.',
    });
  });

  it('giữ nguyên khi xem lại, huỷ gậy nghiêm trọng (đã có N52): không dòng nào', async () => {
    await none(
      'trust.strike.decided',
      { strikeId: STRIKE, decision: 'kept' },
      serious({ status: 'permanent' }),
    );
    await none(
      'trust.strike.decided',
      { strikeId: STRIKE, decision: 'cancel' },
      serious({ status: 'cancelled' }),
    );
  });
});

describe('N55 — gậy hết hạn', () => {
  it('không nhắc; 3 điểm → 2 điểm: nói đã đăng tin lại được', async () => {
    const draft = await one(
      'trust.strike.expired',
      { strikeId: STRIKE, accountId: OWNER, kind: 'normal' },
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'expired' }) }, points: 2 }),
    );
    expect(draft).toMatchObject({
      type: 'trust.strike.expired',
      alertable: false,
      body: 'Một cảnh cáo của bạn đã hết hạn. Bạn đã đăng tin lại được.',
    });
  });

  it('4 điểm → 3 điểm: vẫn khoá đăng tin, không nói đăng lại; 1 → 0: chưa từng khoá, không nói', async () => {
    const stillLocked = await one(
      'trust.strike.expired',
      { strikeId: STRIKE, accountId: OWNER },
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'expired' }) }, points: 3 }),
    );
    expect(stillLocked.body).toBe('Một cảnh cáo của bạn đã hết hạn.');
    const neverLocked = await one(
      'trust.strike.expired',
      { strikeId: STRIKE, accountId: OWNER },
      contextWith({ strikes: { [STRIKE]: strikeOf({ status: 'expired' }) }, points: 0 }),
    );
    expect(neverLocked.body).toBe('Một cảnh cáo của bạn đã hết hạn.');
  });
});

describe('N56, N57 — mức tin cậy', () => {
  it('T1 → T2: không nhắc; T2 → T1: có nhắc; giữ nguyên hay mức lạ: không dòng nào', async () => {
    const ctx = contextWith();
    expect(
      await one('trust.tier.changed', { accountId: OWNER, from: 'T1', to: 'T2' }, ctx),
    ).toMatchObject({
      type: 'trust.tier.raised',
      alertable: false,
      body: 'Tài khoản đã lên mức T2.',
    });
    expect(
      await one('trust.tier.changed', { accountId: OWNER, from: 'T2', to: 'T1' }, ctx),
    ).toMatchObject({
      type: 'trust.tier.lowered',
      alertable: true,
      body: 'Tài khoản đang ở mức T1.',
    });
    await none('trust.tier.changed', { accountId: OWNER, from: 'T2', to: 'T2' }, ctx);
    await none('trust.tier.changed', { accountId: OWNER, from: 'T2', to: 'T9' }, ctx);
  });
});

describe('N58 — thời gian chờ đăng tin', () => {
  it('có nhắc, đúng từng chữ câu của lỗi 429, gộp theo người với câu theo mốc mới nhất', async () => {
    const until = new Date('2026-10-23T08:30:00.000Z');
    const draft = await one(
      'screening.cooldown.started',
      { accountId: OWNER, until: until.toISOString() },
      contextWith(),
    );
    expect(draft).toMatchObject({
      type: 'listing.submission.cooldown',
      category: 'trust_strikes',
      alertable: true,
      body: 'Tạm thời chưa gửi được tin mới — gửi lại từ 15:30 ngày 23/10/2026',
      data: { retryAt: until.toISOString() },
    });
    expect(draft.body).toBe(submissionCooldown(until).message);
    expect(draft.body).not.toMatch(/cổng|cụm từ|ảnh|giá|lượt/);
    expect(draft.collapse?.key).toBe('trust:cooldown');
    expect(draft.collapse?.render(4)).toBe(draft.body);
  });

  it('mốc hỏng: không dòng nào', async () => {
    await none(
      'screening.cooldown.started',
      { accountId: OWNER, until: 'không phải ngày' },
      contextWith(),
    );
  });
});
