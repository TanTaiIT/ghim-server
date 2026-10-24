import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { prisma } from './db-helpers.js';
import type { TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { uploadImage } from './media-helpers.js';
import { tokenFor } from './ops-helpers.js';

/**
 * Luồng tin đăng qua HTTP như app: nháp → ảnh → gửi → máy cho qua. Mỗi bước trả DTO người đăng thấy, để ca test
 * chỉ viết đúng bước đang kiểm.
 */
export const DEVICE = 'may-thu-cua-test';

/** Tin như người đăng thấy qua JSON — đủ trường mà các ca đọc. */
export interface OwnListing {
  id: string;
  ownerId: string;
  version: number;
  state: string;
  placement: string | null;
  groupId: string | null;
  unitId: string | null;
  title: string | null;
  price: number | null;
  categoryId: string | null;
  provinceCode: number | null;
  wardCode: number | null;
  images: { id: string; url: string }[];
  badge: { groupId: string; name: string } | null;
  machineNotice: {
    kind: string;
    message: string;
    fixes: { code: string; message: string }[];
  } | null;
  badgeGroupId: string | null;
  hideReasons: string[];
  restrictions: string[];
  firstLiveAt: string | null;
  expiresAt: string | null;
  remainingMs: number | null;
  renewal: string | null;
  fault: string | null;
  moveUntil: string | null;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Gọi API kèm token (nếu có) và `x-device-id` (mặc định có — mọi lượt gửi bắt buộc, D2). */
export function listingApi(
  app: FastifyInstance,
  method: Method,
  url: string,
  user: TestUser | null,
  payload?: object,
  device: string | null = DEVICE,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
      ...(device ? { 'x-device-id': device } : {}),
    },
    ...(payload ? { payload } : {}),
  });
}

const expectStatus = (res: LightMyRequestResponse, status: number, step: string): void => {
  if (res.statusCode !== status) throw new Error(`${step} hỏng: ${res.statusCode} ${res.body}`);
};

function dataOf(res: LightMyRequestResponse, status: number, step: string): OwnListing {
  expectStatus(res, status, step);
  return res.json().data as OwnListing;
}

export interface Region {
  provinceCode: number;
  wardCode: number;
}

/** Khu vực có thật (bảng `regions.json` nạp vào DB lần đầu) — tin sàn chung bắt buộc có. */
export async function someRegion(app: FastifyInstance): Promise<Region> {
  await app.modules.region.seedRegionsIfEmpty();
  const ward = await prisma.ward.findFirstOrThrow({ orderBy: { code: 'asc' } });
  return { provinceCode: ward.provinceCode, wardCode: ward.code };
}

export const createDraft = async (
  app: FastifyInstance,
  user: TestUser,
  body: object = {},
): Promise<OwnListing> =>
  dataOf(await listingApi(app, 'POST', '/listings', user, body), 201, 'Tạo nháp');

export const uploadFor = (
  app: FastifyInstance,
  user: TestUser,
  listingId: string,
  fill = 0xff,
): Promise<string> => uploadImage(app, user, fill, { ownerKind: 'listing', ownerId: listingId });

export const patch = (
  app: FastifyInstance,
  user: TestUser,
  listing: { id: string; version: number },
  body: object,
  device: string | null = DEVICE,
): Promise<LightMyRequestResponse> =>
  listingApi(
    app,
    'PATCH',
    `/listings/${listing.id}`,
    user,
    { version: listing.version, ...body },
    device,
  );

export const submit = (
  app: FastifyInstance,
  user: TestUser,
  listing: { id: string; version: number },
  device: string | null = DEVICE,
): Promise<LightMyRequestResponse> =>
  listingApi(
    app,
    'POST',
    `/listings/${listing.id}/submit`,
    user,
    { version: listing.version },
    device,
  );

/** Ảnh tải song song cho một tin, ruột ảnh thứ i tô byte i + 1 — kết quả giữ đúng thứ tự. */
export const uploadMany = (
  app: FastifyInstance,
  user: TestUser,
  listingId: string,
  count: number,
): Promise<string[]> =>
  Promise.all(Array.from({ length: count }, (_, i) => uploadFor(app, user, listingId, i + 1)));

/** Nháp đủ trường để gửi: sàn chung, danh mục đang bật, khu vực, `images` ảnh đã tải — `fields` đè từng trường. */
export async function readyDraft(
  app: FastifyInstance,
  user: TestUser,
  fields: Record<string, unknown> = {},
  images = 1,
): Promise<OwnListing> {
  const draft = await createDraft(app, user);
  const body = {
    title: 'Xe đạp cũ còn tốt',
    price: 1_200_000,
    categoryId: await seedCategory(),
    placement: 'marketplace',
    ...(await someRegion(app)),
    imageIds: await uploadMany(app, user, draft.id, images),
    ...fields,
  };
  return dataOf(await patch(app, user, draft, body), 200, 'Lưu nháp đủ trường');
}

/** Nháp đủ trường đã gửi — đang kiểm. */
export async function submitted(
  app: FastifyInstance,
  user: TestUser,
  fields: Record<string, unknown> = {},
  images = 1,
): Promise<OwnListing> {
  const draft = await readyDraft(app, user, fields, images);
  return dataOf(await submit(app, user, draft), 200, 'Gửi nháp');
}

export const getOwn = async (
  app: FastifyInstance,
  user: TestUser,
  id: string,
): Promise<OwnListing> =>
  dataOf(await listingApi(app, 'GET', `/listings/${id}`, user), 200, 'Đọc tin');

/** Máy cho qua (đầy đủ, hay hạn chế) đúng phiên bản đang kiểm — đường kết quả máy thật sẽ đi. */
export async function machinePass(
  app: FastifyInstance,
  user: TestUser,
  listing: { id: string; version: number },
  restrictMachine = false,
): Promise<OwnListing> {
  const applied = await app.modules.listing.applyMachineOutcome({
    listingId: listing.id,
    listingVersion: listing.version,
    outcome: 'pass',
    restrictMachine,
  });
  if (!applied) throw new Error('Máy cho qua không áp được');
  return getOwn(app, user, listing.id);
}

/** Tin đang hiển thị qua đúng luồng thật: nháp → gửi → máy cho qua. */
export async function liveListingOf(
  app: FastifyInstance,
  user: TestUser,
  fields: Record<string, unknown> = {},
  images = 1,
): Promise<OwnListing> {
  return machinePass(app, user, await submitted(app, user, fields, images));
}

/** Mẫu thông tin phát hành qua bàn vận hành, như master làm — trả phiên bản vừa phát hành. */
export async function publishTemplate(
  app: FastifyInstance,
  master: TestUser,
  categoryId: string,
  fields: object[],
): Promise<number> {
  const draft = await listingApi(
    app,
    'GET',
    `/ops/categories/${categoryId}/template/draft`,
    master,
  );
  const base = draft.statusCode === 200 ? (draft.json().data.draftVersion as number) : 0;
  expectStatus(
    await listingApi(app, 'PUT', `/ops/categories/${categoryId}/template/draft`, master, {
      baseDraftVersion: base,
      fields,
    }),
    200,
    'Soạn mẫu',
  );
  const published = await listingApi(
    app,
    'POST',
    `/ops/categories/${categoryId}/template/publish`,
    master,
  );
  expectStatus(published, 201, 'Phát hành mẫu');
  return published.json().data.version as number;
}

export async function setCategoryEnabled(
  app: FastifyInstance,
  master: TestUser,
  categoryId: string,
  enabled: boolean,
): Promise<void> {
  const action = enabled ? 'enable' : 'disable';
  expectStatus(
    await listingApi(app, 'POST', `/ops/categories/${categoryId}/${action}`, master),
    200,
    `Đổi trạng thái danh mục (${action})`,
  );
}

export async function groupSettings(
  app: FastifyInstance,
  owner: TestUser,
  groupId: string,
  body: object,
): Promise<void> {
  expectStatus(
    await listingApi(app, 'PATCH', `/groups/${groupId}/settings`, owner, body),
    200,
    'Đổi cài đặt nhóm',
  );
}

let categorySeq = 0;

/** Danh mục lập qua bàn vận hành (có phiên bản cài đặt 1) — cần khi ca test tắt danh mục hay phát hành mẫu. */
export async function createCategory(app: FastifyInstance, master: TestUser): Promise<string> {
  categorySeq += 1;
  const res = await listingApi(app, 'POST', '/ops/categories', master, {
    name: `Danh mục HTTP ${categorySeq} ${Date.now()}`,
  });
  expectStatus(res, 201, 'Lập danh mục');
  return res.json().data.id as string;
}

/** Phiên mới ký ở thời điểm `at` — ca test đẩy đồng hồ app qua hạn 30 ngày của phiên dựng sẵn. */
export const signedInAt = async (
  app: FastifyInstance,
  user: TestUser,
  at: Date,
): Promise<TestUser> => ({ ...user, token: await tokenFor(app, user.id, at) });

/** Máy giữ cho người đúng phiên bản đang kiểm — tin sang chờ duyệt. */
export async function machineHold(
  app: FastifyInstance,
  user: TestUser,
  listing: { id: string; version: number },
): Promise<OwnListing> {
  const applied = await app.modules.listing.applyMachineOutcome({
    listingId: listing.id,
    listingVersion: listing.version,
    outcome: 'hold',
    restrictMachine: false,
  });
  if (!applied) throw new Error('Máy giữ không áp được');
  return getOwn(app, user, listing.id);
}
