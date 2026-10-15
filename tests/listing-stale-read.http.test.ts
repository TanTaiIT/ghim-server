import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CategoryRepository } from '../src/modules/category/category.repository.js';
import type { IdentityRepository } from '../src/modules/identity/identity.repository.js';
import type { ListingRepository } from '../src/modules/listing/listing.repository.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { getOwn, liveListingOf, patch, readyDraft, submit } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, repositories, TEST_AUDIT, TEST_NOW } from './test-app.js';

/*
 * Lượt ghi của người đăng chen với thay đổi của hệ thống (fix-audit-listing, T14, T15). Repository bọc trả dữ kiện CŨ
 * cho lượt đọc trước khoá — đúng cảnh lượt đọc xảy ra trước thay đổi, lượt ghi sau — còn DB đã mang thay đổi thật.
 */
const staleListings = new Map<string, { placement?: 'group_public'; badgeGroupId?: string }>();
const staleCategories = new Set<string>();
const staleAccounts = new Set<string>();

const listingRepository: ListingRepository = {
  ...repositories.listing,
  async findById(id) {
    const row = await repositories.listing.findById(id);
    const stale = staleListings.get(id);
    if (!row || !stale) return row;
    staleListings.delete(id);
    return { ...row, ...stale };
  },
};
const categoryRepository: CategoryRepository = {
  ...repositories.category,
  async findStatuses(ids) {
    const rows = await repositories.category.findStatuses(ids);
    return rows.map((row) => (staleCategories.has(row.id) ? { ...row, status: 'active' } : row));
  },
};
const identityRepository: IdentityRepository = {
  ...repositories.identity,
  async findActorSession(sessionId) {
    const row = await repositories.identity.findActorSession(sessionId);
    return row && staleAccounts.has(row.accountId)
      ? { ...row, status: 'active', revokedAt: null }
      : row;
  },
};

let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    trust: createInterimTrust('T1'),
    screening: interimScreening,
    repositories: {
      listing: listingRepository,
      category: categoryRepository,
      identity: identityRepository,
    },
  });
  await app.ready();
  master = await newMaster(app);
});

afterEach(() => {
  staleListings.clear();
  staleCategories.clear();
  staleAccounts.clear();
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });

describe('Lượt ghi của người đăng không đè thay đổi của hệ thống (T14)', () => {
  it('nhóm riêng tư hoá trong lúc sửa tiêu đề: tiêu đề mới, tin vẫn "chỉ thành viên"', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
      categoryId: await seedCategory(),
    });
    // Hệ thống hạ nơi đăng không tăng phiên bản (riêng tư hoá); màn hình của người đăng còn "nhóm công khai".
    await prisma.listing.update({ where: { id: live.id }, data: { placement: 'members_only' } });
    staleListings.set(live.id, { placement: 'group_public' });
    const res = await patch(app, member, live, { title: 'Tiêu đề mới hẳn' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await row(live.id)).toMatchObject({
      title: 'Tiêu đề mới hẳn',
      placement: 'members_only',
      groupId: group.groupId,
    });
  });

  it('huy hiệu bị gỡ trong lúc bật "giao tận nơi": bật được, không mang huy hiệu', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, { categoryId: await seedCategory() });
    staleListings.set(live.id, { badgeGroupId: group.groupId });
    const res = await patch(app, member, live, { delivery: true });
    expect(res.statusCode, res.body).toBe(200);
    expect(await row(live.id)).toMatchObject({ delivery: true, badgeGroupId: null, state: 'live' });
  });
});

describe('Gửi tin đúng lúc tắt danh mục hay khoá tài khoản (T15)', () => {
  it('danh mục bị tắt sau bước kiểm danh mục: 409 CATEGORY_DISABLED, nháp vẫn là nháp', async () => {
    const user = await newUser(app);
    const categoryId = await seedCategory();
    const draft = await readyDraft(app, user, { categoryId });
    await prisma.category.update({ where: { id: categoryId }, data: { status: 'disabled' } });
    staleCategories.add(categoryId);
    const res = await submit(app, user, draft);
    expect(res.statusCode, res.body).toBe(409);
    expect(codeOf(res)).toBe('CATEGORY_DISABLED');
    expect((await getOwn(app, user, draft.id)).state).toBe('draft');
  });

  it('tài khoản bị khoá sau bước đăng nhập: 403 ACCOUNT_LOCKED, nháp vẫn là nháp', async () => {
    const user = await newUser(app);
    const draft = await readyDraft(app, user);
    await repositories.identity.lockAccount({
      accountId: user.id,
      reason: 'Thử',
      lockedBy: master.id,
      at: TEST_NOW,
      events: [],
      audit: TEST_AUDIT,
    });
    staleAccounts.add(user.id);
    const res = await submit(app, user, draft);
    expect(res.statusCode, res.body).toBe(403);
    expect(codeOf(res)).toBe('ACCOUNT_LOCKED');
    expect((await row(draft.id)).state).toBe('draft');
  });
});
