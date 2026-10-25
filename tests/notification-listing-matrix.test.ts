import { describe, expect, it } from 'vitest';

import type { MachineNotice } from '../src/modules/listing/listing.ports.js';
import { LISTING_EVENTS } from '../src/modules/listing/listing.outbox.js';
import { LISTING_MATRIX } from '../src/modules/notification/notification.listing-matrix.js';
import type { MatrixContext, Payload } from '../src/modules/notification/notification.matrix.js';

/*
 * Dòng N43, N44 của ma trận (change notify-listing-decisions) với ngữ cảnh giả: máy giữ tin, máy rút tin về — người
 * nhận, câu nhắc, câu của máy trong nội dung xem trong app. Luồng thật ở `notification-listing-decisions.http.test.ts`.
 */
const LISTING = '0199a000-0000-7000-8000-000000000201';
const OWNER = '0199a000-0000-7000-8000-0000000000a2';

const unused = () => Promise.reject(new Error('dòng máy giữ không được hỏi điều này'));
const contextWith = (notice: MachineNotice | null): MatrixContext => ({
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
  listingTitles: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'Xe đạp cũ'] as const))),
  listingTargets: unused,
  savedSearchMatches: () => Promise.resolve([]),
  masterIds: unused,
  machineNotice: () => Promise.resolve(notice),
  messagePreview: unused,
  strike: unused,
  standing: unused,
  postingLockPoints: () => {
    throw new Error('ma trận này không được hỏi ngưỡng khoá đăng tin');
  },
  liveAccounts: unused,
  groupHeldNotice: unused,
});

const stateChanged = (payload: Payload, notice: MachineNotice | null = null) => {
  const handler = LISTING_MATRIX[LISTING_EVENTS.stateChanged];
  if (!handler) throw new Error('Thiếu dòng listing.state.changed');
  return handler(
    {
      listingId: LISTING,
      ownerId: OWNER,
      placement: 'marketplace',
      groupId: null,
      firstLive: false,
      full: false,
      hidden: false,
      ...payload,
    },
    contextWith(notice),
  );
};

const FRAUD: MachineNotice = {
  kind: 'fraud',
  message: 'Tin cần kiểm tra an toàn thêm',
  estimatedWait: 'Thường trong 24 giờ',
  lookupCode: 'KTRA-7Q3M',
  fixes: [],
};

describe('N43 — máy giữ tin chờ người duyệt', () => {
  it('dấu hiệu gian lận: người đăng nhận, có nhắc; câu chung ba phần chỉ trong nội dung xem trong app', async () => {
    const { drafts, fanOuts } = await stateChanged(
      { from: 'checking', to: 'pending', arrow: 'hold' },
      FRAUD,
    );
    expect(fanOuts).toEqual([]);
    expect(drafts).toEqual([
      expect.objectContaining({
        recipients: [OWNER],
        category: 'your_listings',
        type: 'listing.machine.hold',
        title: 'Xe đạp cũ',
        body: 'Tin «Xe đạp cũ» đang chờ người duyệt xem.',
        detail:
          'Tin cần kiểm tra an toàn thêm. Thường trong 24 giờ.\nMã tra cứu khi liên hệ hỗ trợ: KTRA-7Q3M.',
        alertable: true,
        personal: true,
      }),
    ]);
  });

  it('lỗi tự sửa được: nêu cụ thể điều cần sửa; câu chờ đã có thời gian thì không lặp', async () => {
    const [draft] = (
      await stateChanged(
        { from: 'checking', to: 'pending', arrow: 'hold' },
        {
          kind: 'plain',
          message: 'Tin đang chờ người duyệt, thường trong 24 giờ',
          estimatedWait: 'Thường trong 24 giờ',
          lookupCode: null,
          fixes: [
            {
              code: 'price_over_cap',
              message: 'Giá cao hơn mức tối đa của danh mục này. Kiểm tra lại giá.',
            },
          ],
        },
      )
    ).drafts;
    expect(draft?.detail).toBe(
      'Tin đang chờ người duyệt, thường trong 24 giờ.\nGiá cao hơn mức tối đa của danh mục này. Kiểm tra lại giá.',
    );
  });

  it('lượt không có câu của máy: vẫn báo, không có nội dung thêm', async () => {
    const [draft] = (await stateChanged({ from: 'checking', to: 'pending', arrow: 'hold' })).drafts;
    expect(draft).toMatchObject({ type: 'listing.machine.hold', detail: null });
  });
});

describe('N44 — máy rút tin đang hiện về chờ duyệt', () => {
  it('người đăng nhận, có nhắc: tin tạm ngừng hiển thị để chờ người duyệt xem lại', async () => {
    const [draft] = (await stateChanged({ from: 'live', to: 'pending', arrow: 'recall' })).drafts;
    expect(draft).toMatchObject({
      recipients: [OWNER],
      type: 'listing.machine.recall',
      body: 'Tin «Xe đạp cũ» tạm ngừng hiển thị để chờ người duyệt xem lại.',
      alertable: true,
    });
  });
});

describe('máy cho qua, mũi tên của người đăng: không báo người đăng', () => {
  it('cho qua, gửi, rút về, đánh dấu đã bán: không dòng nào', async () => {
    const results = await Promise.all(
      [
        { from: 'checking', to: 'live', arrow: 'pass' },
        { from: 'draft', to: 'checking', arrow: 'submit' },
        { from: 'pending', to: 'draft', arrow: 'withdraw' },
        { from: 'live', to: 'sold', arrow: 'markSold' },
      ].map((change) => stateChanged(change)),
    );
    expect(results.flatMap((result) => result.drafts)).toEqual([]);
  });
});
