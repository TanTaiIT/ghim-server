import { describe, expect, it } from 'vitest';

import { MEDIA_EVENTS } from '../src/modules/media/media.schema.js';
import { MEDIA_MATRIX } from '../src/modules/notification/notification.media-matrix.js';
import type { MatrixContext } from '../src/modules/notification/notification.matrix.js';

/*
 * Dòng N38, N39 của ma trận (change notify-missing-images) với ngữ cảnh giả: ai nhận, nhóm nào, có nhắc, câu và gộp.
 * Luồng thật — lượt đối chiếu kho, outbox, hộp thư — ở `notification-media.db.test.ts`.
 */
const LISTING = '0199a000-0000-7000-8000-000000000001';
const OWNER = '0199a000-0000-7000-8000-0000000000a1';
const IMAGE = '0199a000-0000-7000-8000-0000000000f1';

const unused = () => Promise.reject(new Error('ma trận ảnh mất không được hỏi điều này'));
const contextWith = (
  targets: Record<string, { ownerId: string; title: string | null }>,
): MatrixContext => ({
  group: unused,
  managers: unused,
  moderators: unused,
  owner: unused,
  names: unused,
  unitName: unused,
  announcement: unused,
  pendingCount: unused,
  listingTitles: unused,
  listingTargets: (ids) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => (targets[id] ? [[id, targets[id]] as const] : []))),
    ),
  masterIds: unused,
});

const handle = MEDIA_MATRIX[MEDIA_EVENTS.imageMissing];
const missing = (ownerKind: string, ownerId: string | null, ctx = contextWith({})) => {
  if (!handle) throw new Error('Thiếu dòng ma trận cho media.image.missing');
  return handle({ imageId: IMAGE, ownerKind, ownerId }, ctx);
};

describe('N38 — ảnh của tin mất khỏi kho', () => {
  it('báo người đăng, nhóm "tin đăng của bạn", có nhắc, gộp theo tin', async () => {
    const result = await missing(
      'listing',
      LISTING,
      contextWith({ [LISTING]: { ownerId: OWNER, title: 'Xe đạp cũ' } }),
    );
    expect(result.fanOuts).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    const [draft] = result.drafts;
    expect(draft).toMatchObject({
      recipients: [OWNER],
      category: 'your_listings',
      personal: true,
      alertable: true,
      type: 'listing.image.missing',
      title: 'Xe đạp cũ',
      body: 'Một ảnh của tin không còn trong kho — mở tin để thay ảnh khác.',
      data: { listingId: LISTING, imageId: IMAGE },
      groupId: null,
    });
    expect(draft?.collapse?.key).toBe(`listings:image-missing:${LISTING}`);
    expect(draft?.collapse?.render(2)).toBe(
      '2 ảnh của tin không còn trong kho — mở tin để thay ảnh khác.',
    );
  });

  it('nháp chưa có tiêu đề: tiêu đề chung "Tin đăng của bạn"', async () => {
    const result = await missing(
      'listing',
      LISTING,
      contextWith({ [LISTING]: { ownerId: OWNER, title: null } }),
    );
    expect(result.drafts[0]?.title).toBe('Tin đăng của bạn');
  });

  it('tin đã xoá hay không còn (cổng `listing` không trả): không báo ai', async () => {
    expect((await missing('listing', LISTING)).drafts).toEqual([]);
  });
});

describe('N39 — ảnh đại diện mất khỏi kho', () => {
  it('báo chủ tài khoản, nhóm "tài khoản", có nhắc, không gộp', async () => {
    const result = await missing('profile', OWNER);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      recipients: [OWNER],
      category: 'account',
      personal: true,
      alertable: true,
      type: 'account.avatar.missing',
      title: 'Ảnh đại diện',
      body: 'Ảnh đại diện của bạn không còn trong kho — chọn ảnh khác.',
      data: { imageId: IMAGE },
    });
    expect(result.drafts[0]?.collapse).toBeUndefined();
  });
});

describe('Sự kiện lạ', () => {
  it('loại chủ lạ hay thiếu mã chủ: không báo ai', async () => {
    expect((await missing('group', OWNER)).drafts).toEqual([]);
    expect((await missing('profile', null)).drafts).toEqual([]);
  });
});
