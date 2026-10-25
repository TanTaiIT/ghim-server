import type { Listing, ListingPlacement, ListingState } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  canView,
  type ListSurface,
  type Viewer,
  visibleWhere,
} from '../src/modules/listing/calc/visibility.calc.js';
import { LISTING_STATES } from '../src/modules/listing/listing.schema.js';
import { prisma } from './db-helpers.js';
import { liveListing, seedCategory, seedGroup } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Luật 25 (một hàm quyết ai thấy một tin): mọi danh sách đọc bằng SQL dựng từ `visibleWhere`, nên phải ra ĐÚNG tập mà
 * `canView` cho phép — với mọi tổ hợp trạng thái × nơi đăng × lý do hạn chế × tạm ẩn × người xem × bề mặt (design
 * add-listings mục 12). Hai nơi lệch nhau là đỏ.
 */
const PLACEMENTS: ListingPlacement[] = ['marketplace', 'group_public', 'members_only'];
let rows: Listing[] = [];
let ownerId = '';
let groupId = '';
let otherGroupId = '';
let viewers: Record<'guest' | 'owner' | 'member' | 'outsider', Viewer>;

beforeAll(async () => {
  ownerId = (await seedAccount()).id;
  const categoryId = await seedCategory();
  groupId = await seedGroup();
  otherGroupId = await seedGroup();
  const combos = LISTING_STATES.flatMap((state: ListingState) =>
    PLACEMENTS.flatMap((placement) =>
      [false, true].flatMap((restricted) =>
        [false, true].map((hidden) =>
          liveListing(ownerId, categoryId, {
            state,
            placement,
            groupId: placement === 'marketplace' ? null : groupId,
            restrictions: restricted ? ['machine'] : [],
            hideReasons: hidden ? ['group_locked'] : [],
          }),
        ),
      ),
    ),
  );
  const extras = [
    liveListing(ownerId, categoryId, { deletedAt: TEST_NOW }),
    liveListing(ownerId, categoryId, { placement: 'group_public', groupId, deletedAt: TEST_NOW }),
    liveListing(ownerId, categoryId, { state: 'draft', placement: null }),
  ];
  await prisma.listing.createMany({ data: [...combos, ...extras] });
  rows = await prisma.listing.findMany({ where: { ownerId } });
  viewers = {
    guest: { accountId: null, memberGroupIds: new Set() },
    owner: { accountId: ownerId, memberGroupIds: new Set() },
    member: { accountId: (await seedAccount()).id, memberGroupIds: new Set([groupId]) },
    outsider: { accountId: (await seedAccount()).id, memberGroupIds: new Set([otherGroupId]) },
  };
});

afterAll(() => prisma.$disconnect());

const SURFACES: { surface: ListSurface; group?: 'own' | 'other' }[] = [
  { surface: 'feed' },
  { surface: 'category' },
  { surface: 'search' },
  { surface: 'suggest' },
  { surface: 'profile' },
  { surface: 'saved' },
  { surface: 'group_feed', group: 'own' },
  { surface: 'group_search', group: 'own' },
  { surface: 'group_feed', group: 'other' },
];

describe('visibleWhere khớp canView', () => {
  it(`${LISTING_STATES.length * PLACEMENTS.length * 4 + 3} tin × 4 người xem × ${SURFACES.length} bề mặt`, async () => {
    expect(rows).toHaveLength(LISTING_STATES.length * PLACEMENTS.length * 4 + 3);
    const cases = Object.entries(viewers).flatMap(([who, viewer]) =>
      SURFACES.map(({ surface, group }) => ({
        label: `${who} · ${surface}${group ? ` (${group})` : ''}`,
        viewer,
        surface,
        target: group === 'own' ? groupId : group === 'other' ? otherGroupId : null,
      })),
    );
    const results = await Promise.all(
      cases.map(async ({ label, viewer, surface, target }) => {
        const sql = await prisma.listing.findMany({
          where: { AND: [visibleWhere(viewer, surface, target), { ownerId }] },
          select: { id: true },
        });
        const got = new Set(sql.map((row) => row.id));
        const want = new Set(
          rows.filter((row) => canView(row, viewer, surface, target)).map((row) => row.id),
        );
        const same = got.size === want.size && [...want].every((id) => got.has(id));
        return same ? null : `${label}: SQL ${got.size}, canView ${want.size}`;
      }),
    );
    expect(results.filter(Boolean)).toEqual([]);
  });

  it('mỗi bề mặt có ít nhất một tin hiện với ai đó — test không đúng vì rỗng', async () => {
    const counts = await Promise.all(
      SURFACES.filter(({ group }) => group !== 'other').map(({ surface, group }) =>
        prisma.listing.count({
          where: {
            AND: [
              visibleWhere(viewers.member, surface, group === 'own' ? groupId : null),
              { ownerId },
            ],
          },
        }),
      ),
    );
    expect(counts.every((count) => count > 0)).toBe(true);
  });
});
