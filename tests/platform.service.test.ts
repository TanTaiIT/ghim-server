import { describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { RUNTIME_CONFIG_DEFAULTS } from '../src/common/config/runtime-config.js';
import {
  createPlatformPrivilegeSource,
  createPlatformService,
  createVersionedRuntimeConfig,
} from '../src/modules/platform/platform.service.js';
import { createFakePlatformRepository } from './fakes/platform-repository.fake.js';

/* Mọi scenario service của bốn spec `platform`, trên repository giả. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const MASTER: Actor = {
  accountId: '00000000-0000-7000-8000-00000000000a',
  role: 'master',
  sessionId: 's',
  secondFactorAt: NOW,
  emailVerified: true,
};
const PHONE = '00000000-0000-7000-8000-0000000000c1';
const COMPUTER = '00000000-0000-7000-8000-0000000000c2';
const MOTORBIKE = '00000000-0000-7000-8000-0000000000c3';

type State = {
  role: 'user' | 'master';
  status: 'pending_verification' | 'active' | 'locked' | 'deleted';
};

function build() {
  const repository = createFakePlatformRepository();
  const accounts = new Map<string, State>();
  const categories = new Set([PHONE, COMPUTER, MOTORBIKE]);
  const loads: number[] = [];
  const service = createPlatformService({
    repository,
    identity: { accountState: async (id) => accounts.get(id) ?? null },
    categories: { existingIds: async (ids) => new Set(ids.filter((id) => categories.has(id))) },
    clock: () => NOW,
    runtimeConfig: { load: async () => void loads.push(1) },
  });
  const privileges = createPlatformPrivilegeSource(repository);
  let seq = 0;
  const account = (state: State = { role: 'user', status: 'active' }): string => {
    seq += 1;
    const id = `00000000-0000-7000-8000-${String(seq).padStart(12, '0')}`;
    accounts.set(id, state);
    return id;
  };
  return { repository, accounts, service, privileges, account, loads };
}

describe('gắn quyền staff', () => {
  it('gắn theo danh mục: đúng phạm vi, một dòng nhật ký dưới tên master', async () => {
    const { service, privileges, repository, account } = build();
    const hung = account();

    const dto = await service.grantStaff(MASTER, hung, {
      scopes: [],
      categoryIds: [PHONE, COMPUTER],
    });

    expect(dto).toMatchObject({
      accountId: hung,
      status: 'active',
      categoryIds: [PHONE, COMPUTER],
    });
    expect(await privileges.hasCategoryScope(hung, PHONE)).toBe(true);
    expect(await privileges.hasCategoryScope(hung, MOTORBIKE)).toBe(false);
    expect(repository.audit).toHaveLength(1);
    expect(repository.audit[0]).toMatchObject({
      actorId: MASTER.accountId,
      actorRole: 'master',
      action: 'platform.staff.grant',
      targetType: 'account',
      targetId: hung,
    });
  });

  it('chỉ việc toàn hệ thống, không danh mục', async () => {
    const { service, privileges, account } = build();
    const mai = account();
    expect(
      await service.grantStaff(MASTER, mai, { scopes: ['support'], categoryIds: [] }),
    ).toMatchObject({
      scopes: ['support'],
      categoryIds: [],
    });
    expect(await privileges.hasStaffScope(mai, 'support')).toBe(true);
    expect(await privileges.hasStaffScope(mai, 'id_verification')).toBe(false);
  });

  it('gửi lại là thay CẢ gói: thu một danh mục có hiệu lực ngay ở lượt hỏi kế tiếp', async () => {
    const { service, privileges, account } = build();
    const hung = account();
    await service.grantStaff(MASTER, hung, { scopes: [], categoryIds: [PHONE, COMPUTER] });
    await service.grantStaff(MASTER, hung, { scopes: ['id_verification'], categoryIds: [PHONE] });

    expect(await privileges.hasCategoryScope(hung, COMPUTER)).toBe(false);
    expect(await privileges.hasCategoryScope(hung, PHONE)).toBe(true);
    expect(await privileges.hasStaffScope(hung, 'id_verification')).toBe(true);
  });

  it('tài khoản không có / đã xoá → 404; danh mục không có → 404 và không gắn gì', async () => {
    const { service, repository, account } = build();
    await expect(
      service.grantStaff(MASTER, '00000000-0000-7000-8000-ffffffffffff', {
        scopes: ['support'],
        categoryIds: [],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const deleted = account({ role: 'user', status: 'deleted' });
    await expect(
      service.grantStaff(MASTER, deleted, { scopes: ['support'], categoryIds: [] }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const hung = account();
    await expect(
      service.grantStaff(MASTER, hung, {
        scopes: [],
        categoryIds: [PHONE, '00000000-0000-7000-8000-0000000000ff'],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await repository.findStaff(hung)).toBeNull();
    expect(repository.audit).toHaveLength(0);
  });

  it('đang khoá, chưa xác nhận email, hay là master → 409 STAFF_PERMISSION_INELIGIBLE kèm lý do', async () => {
    const { service, repository, account } = build();
    const cases: Array<[State, string]> = [
      [{ role: 'user', status: 'locked' }, 'khoá'],
      [{ role: 'user', status: 'pending_verification' }, 'xác nhận email'],
      [{ role: 'master', status: 'active' }, 'master'],
    ];
    const errors = await Promise.all(
      cases.map(([state]) =>
        service
          .grantStaff(MASTER, account(state), { scopes: ['support'], categoryIds: [] })
          .catch((caught: unknown) => caught),
      ),
    );
    errors.forEach((error, index) => {
      expect(error).toMatchObject({ statusCode: 409, code: 'STAFF_PERMISSION_INELIGIBLE' });
      expect((error as Error).message).toContain(cases[index]?.[1]);
    });
    expect(repository.staff.size).toBe(0);
  });

  it('nhiều staff một danh mục: gắn người sau không đổi quyền người trước; lọc theo danh mục ra cả hai', async () => {
    const { service, account } = build();
    const hung = account();
    const mai = account();
    await service.grantStaff(MASTER, hung, { scopes: [], categoryIds: [PHONE, COMPUTER] });
    await service.grantStaff(MASTER, mai, { scopes: [], categoryIds: [PHONE] });

    const phone = await service.listStaff(PHONE);
    expect(phone.map((row) => row.accountId).toSorted()).toEqual([hung, mai].toSorted());
    expect(phone.find((row) => row.accountId === hung)?.categoryIds).toEqual([PHONE, COMPUTER]);
    expect((await service.listStaff(COMPUTER)).map((row) => row.accountId)).toEqual([hung]);
  });
});

describe('thu, treo, trả lại', () => {
  it('thu toàn bộ: lượt hỏi kế tiếp là "none"; thu lần hai → 404', async () => {
    const { service, privileges, repository, account } = build();
    const hung = account();
    await service.grantStaff(MASTER, hung, { scopes: ['support'], categoryIds: [PHONE] });
    await service.revokeStaff(MASTER, hung);

    expect(await privileges.permissionState(hung)).toBe('none');
    expect(await privileges.isStaff(hung)).toBe(false);
    expect(repository.audit.at(-1)).toMatchObject({
      action: 'platform.staff.revoke',
      targetId: hung,
    });
    await expect(service.revokeStaff(MASTER, hung)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('khoá → treo giữ nguyên phạm vi, lý do "tài khoản bị khoá"; treo lần hai không đổi gì', async () => {
    const { service, privileges, account, repository } = build();
    const hung = account();
    await service.grantStaff(MASTER, hung, { scopes: [], categoryIds: [PHONE] });

    await service.suspendStaffForLock(hung);
    await service.suspendStaffForLock(hung);

    const [row] = await service.listStaff(PHONE);
    expect(row).toMatchObject({
      accountId: hung,
      status: 'suspended',
      suspendedReason: 'tài khoản bị khoá',
      categoryIds: [PHONE],
    });
    expect(await privileges.permissionState(hung)).toBe('suspended');
    expect(await privileges.hasCategoryScope(hung, PHONE)).toBe(false);
    // Vẫn là staff với đăng nhập: trần 3 phiên, đòi lớp thứ hai (spec staff-permissions).
    expect(await privileges.isStaff(hung)).toBe(true);
    // Treo là việc của hệ thống, không phải của người: không có dòng nhật ký.
    expect(
      repository.audit.filter((entry) => entry.action !== 'platform.staff.grant'),
    ).toHaveLength(0);
  });

  it('trả lại khi tài khoản còn khoá → 409 INELIGIBLE, vẫn treo; mở khoá rồi trả lại → đúng phạm vi cũ', async () => {
    const { service, privileges, accounts, account } = build();
    const hung = account();
    await service.grantStaff(MASTER, hung, { scopes: ['user_reports'], categoryIds: [PHONE] });
    accounts.set(hung, { role: 'user', status: 'locked' });
    await service.suspendStaffForLock(hung);

    await expect(service.restoreStaff(MASTER, hung)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STAFF_PERMISSION_INELIGIBLE',
      message: expect.stringContaining('tài khoản đang bị khoá'),
    });
    expect(await privileges.permissionState(hung)).toBe('suspended');

    accounts.set(hung, { role: 'user', status: 'active' });
    // Mở khoá không tự trả lại.
    expect(await privileges.permissionState(hung)).toBe('suspended');
    expect(await service.restoreStaff(MASTER, hung)).toMatchObject({
      status: 'active',
      suspendedReason: null,
      scopes: ['user_reports'],
      categoryIds: [PHONE],
    });
    expect(await privileges.hasCategoryScope(hung, PHONE)).toBe(true);
  });

  it('trả lại quyền không treo → 409; không có quyền → 404; thu hẳn quyền đang treo thì hết trong danh sách', async () => {
    const { service, account } = build();
    const hung = account();
    await expect(service.restoreStaff(MASTER, hung)).rejects.toMatchObject({ statusCode: 404 });
    await service.grantStaff(MASTER, hung, { scopes: ['support'], categoryIds: [] });
    await expect(service.restoreStaff(MASTER, hung)).rejects.toMatchObject({ statusCode: 409 });

    await service.suspendStaffForLock(hung);
    await service.revokeStaff(MASTER, hung);
    expect(await service.listStaff()).toEqual([]);
  });

  it('master thu rồi gắn lại: theo thao tác sau cùng', async () => {
    const { service, privileges, account } = build();
    const hung = account();
    await service.grantStaff(MASTER, hung, { scopes: ['support'], categoryIds: [] });
    await service.revokeStaff(MASTER, hung);
    await service.grantStaff(MASTER, hung, { scopes: ['support'], categoryIds: [] });
    expect(await privileges.hasStaffScope(hung, 'support')).toBe(true);
  });
});

describe('bảng con số', () => {
  it('phiên bản 1 = giá trị khởi đầu TK 28; nạp lần hai không làm gì', async () => {
    const { service, loads } = build();
    expect(await service.ensureConfigVersion()).toEqual({
      version: 1,
      addedKeys: Object.keys(RUNTIME_CONFIG_DEFAULTS).length,
    });
    expect(await service.ensureConfigVersion()).toBeNull();

    const current = await service.getCurrentConfig();
    expect(current.version).toBe(1);
    expect(current.values['quota.liveListingsT0']).toBe(10);
    expect(current.values['group.applicationExpiresDays']).toBe(21);
    expect(Object.keys(current.values).toSorted()).toEqual(
      Object.keys(RUNTIME_CONFIG_DEFAULTS).toSorted(),
    );
    expect(loads).toHaveLength(1);
  });

  it('đổi một con số: phiên bản 2 ghi người đổi, ghi chú, bảng nạp lại ngay; phiên bản 1 không đổi', async () => {
    const { service, repository, loads } = build();
    await service.ensureConfigVersion();

    const v2 = await service.changeConfig(MASTER, {
      baseVersion: 1,
      changes: { 'quota.submitsPerHourT0': 4 },
      note: 'theo kết quả hậu kiểm tháng 10',
    });

    expect(v2).toMatchObject({
      version: 2,
      createdBy: MASTER.accountId,
      note: 'theo kết quả hậu kiểm tháng 10',
    });
    expect(v2.values['quota.submitsPerHourT0']).toBe(4);
    expect(v2.values['quota.liveListingsT0']).toBe(10);
    expect((await service.getConfigVersion(1)).values['quota.submitsPerHourT0']).toBe(3);
    expect(loads).toHaveLength(2);
    expect(repository.audit.at(-1)).toMatchObject({
      actorId: MASTER.accountId,
      action: 'platform.config.change',
      targetId: '2',
      details: { version: 2 },
    });
  });

  it('nhiều con số một lần → đúng một phiên bản mới chứa cả hai', async () => {
    const { service } = build();
    await service.ensureConfigVersion();
    const v2 = await service.changeConfig(MASTER, {
      baseVersion: 1,
      changes: { 'group.applicationExpiresDays': 30, 'group.inviteExpiresDays': 7 },
    });
    expect(v2.version).toBe(2);
    expect(v2.values).toMatchObject({
      'group.applicationExpiresDays': 30,
      'group.inviteExpiresDays': 7,
    });
    expect((await service.getCurrentConfig()).version).toBe(2);
  });

  it.each([
    ['số âm', { 'quota.liveListingsT1': -5 }],
    ['phần trăm quá 100', { 'postcheck.newAccountSamplePercent': 120 }],
    ['số lẻ', { 'quota.liveListingsT1': 1.5 }],
    ['khoá lạ đi cùng khoá đúng', { 'quota.liveListingsT1': 30, 'khong.co.khoa': 1 }],
  ])('%s → 400 VALIDATION_ERROR, không phiên bản nào được tạo', async (_case, changes) => {
    const { service, repository } = build();
    await service.ensureConfigVersion();
    await expect(service.changeConfig(MASTER, { baseVersion: 1, changes })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(repository.configVersions.size).toBe(1);
    expect(repository.audit).toHaveLength(0);
  });

  it('hai phiên cùng sửa từ phiên bản 2: lượt sau → 409 CONFLICT, bảng vẫn ở 3', async () => {
    const { service } = build();
    await service.ensureConfigVersion();
    await service.changeConfig(MASTER, { baseVersion: 1, changes: { 'quota.liveListingsT0': 11 } });

    await service.changeConfig(MASTER, { baseVersion: 2, changes: { 'quota.liveListingsT0': 12 } });
    await expect(
      service.changeConfig(MASTER, { baseVersion: 2, changes: { 'quota.liveListingsT0': 13 } }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    const current = await service.getCurrentConfig();
    expect(current).toMatchObject({ version: 3 });
    expect(current.values['quota.liveListingsT0']).toBe(12);
  });

  it('sổ đăng ký có khoá mới: phiên bản kế thêm đúng khoá đó, phiên bản cũ nguyên, không có nhật ký', async () => {
    const { service, repository } = build();
    const { 'quota.liveListingsT0': _dropped, ...older } = RUNTIME_CONFIG_DEFAULTS;
    await repository.seedConfigVersion(older, MASTER.accountId, NOW);

    expect(await service.ensureConfigVersion()).toEqual({ version: 2, addedKeys: 1 });
    expect((await service.getConfigVersion(1)).values).not.toHaveProperty('quota.liveListingsT0');
    const v2 = await service.getCurrentConfig();
    expect(v2.values['quota.liveListingsT0']).toBe(10);
    expect(v2.note).toContain('quota.liveListingsT0');
    expect(repository.audit).toHaveLength(0);
  });

  it('master đổi một con số trên phiên bản thiếu khoá: phiên bản mới vẫn mang trọn sổ đăng ký', async () => {
    const { service, repository } = build();
    const { 'quota.liveListingsT0': _dropped, ...older } = RUNTIME_CONFIG_DEFAULTS;
    await repository.seedConfigVersion(older, MASTER.accountId, NOW);
    const v2 = await service.changeConfig(MASTER, {
      baseVersion: 1,
      changes: { 'quota.liveListingsT1': 25 },
    });
    expect(v2.values).toMatchObject({ 'quota.liveListingsT0': 10, 'quota.liveListingsT1': 25 });
  });

  it('phiên bản không có → 404', async () => {
    const { service } = build();
    await service.ensureConfigVersion();
    await expect(service.getConfigVersion(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createVersionedRuntimeConfig', () => {
  it('đọc trước load() là lỗi lập trình; bảng rỗng thì dùng giá trị khởi đầu', async () => {
    const repository = createFakePlatformRepository();
    const config = createVersionedRuntimeConfig(repository);
    expect(() => config.get('quota.liveListingsT0')).toThrow(/load/);
    await config.load();
    expect(config.get('quota.liveListingsT0')).toBe(10);
  });

  it('tiến trình khác ghi: sau 5 giây lượt get kế tiếp làm mới nền, lượt sau nữa thấy số mới', async () => {
    const repository = createFakePlatformRepository();
    let now = 0;
    const config = createVersionedRuntimeConfig(repository, () => now);
    await repository.seedConfigVersion({ ...RUNTIME_CONFIG_DEFAULTS }, MASTER.accountId, NOW);
    await config.load();
    await repository.createConfigVersion({
      baseVersion: 1,
      values: { ...RUNTIME_CONFIG_DEFAULTS, 'quota.submitsPerHourT0': 4 },
      note: null,
      createdBy: MASTER.accountId,
      at: NOW,
      audit: {
        actorId: MASTER.accountId,
        actorRole: 'master',
        action: 'platform.config.change',
        targetType: 'config_version',
        targetId: '2',
      },
    });

    now = 4_000;
    expect(config.get('quota.submitsPerHourT0')).toBe(3);
    now = 6_000;
    expect(config.get('quota.submitsPerHourT0')).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(config.get('quota.submitsPerHourT0')).toBe(4);
  });
});

describe('tra nhật ký', () => {
  it('lọc theo đối tượng, xếp theo thời gian, phân trang', async () => {
    const { service, account } = build();
    const hung = account();
    const mai = account();
    await service.grantStaff(MASTER, hung, { scopes: ['support'], categoryIds: [] });
    await service.grantStaff(MASTER, mai, { scopes: ['support'], categoryIds: [] });
    await service.revokeStaff(MASTER, hung);

    const page = await service.queryAudit({ targetId: hung, page: 1, limit: 20 });
    expect(page.total).toBe(2);
    expect(page.items.map((row) => row.action)).toEqual([
      'platform.staff.grant',
      'platform.staff.revoke',
    ]);

    const byActor = await service.queryAudit({ actorId: MASTER.accountId, page: 2, limit: 2 });
    expect(byActor).toMatchObject({ total: 3, totalPages: 2 });
    expect(byActor.items).toHaveLength(1);
  });
});
