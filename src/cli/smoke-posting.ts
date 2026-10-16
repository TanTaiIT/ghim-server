import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

import { env } from '../config/env.js';
import { argOf, hasFlag, usage } from './cli-args.js';
import { codeFromMailLog, codeFromMailpit } from './smoke-mail.js';

/*
 * Chạy khói luồng đăng tin trên một server ĐANG CHẠY (mặc định `http://localhost:<PORT>` của `.env.development`), qua
 * đúng API app gọi, rồi đọc DB (chỉ đọc) để đối chiếu kết quả của máy duyệt và hàng chờ:
 *
 *   1. Tài khoản A mới: đăng ký → mã email → xác nhận → đăng nhập → nháp → tải một ảnh JPEG thật → lưu → gửi → chờ máy.
 *      Mong đợi: lên bảng, hạn chế "tài khoản mới" (T0); khách mở link được, tìm theo từ khoá thấy, hồ sơ người bán
 *      thấy, bảng tin chung KHÔNG thấy (spec listing/visibility).
 *   2. Tài khoản B mới gửi tin cùng ảnh đó. Mong đợi: máy giữ vì cổng cứng "ảnh trùng" (chỉ đúng ảnh của B), khách mở link
 *      nhận 404, hàng chờ có việc `machine_hold`.
 *   3. Mũi tên của người đăng: A bật "giao tận nơi" (không qua máy, vẫn hiển thị), sửa giá (qua máy lại, người lạ không
 *      thấy tới khi máy cho qua); sau khi B chép ảnh, A sửa giá lần nữa vẫn qua (người đăng trước thắng); B đánh dấu đã
 *      bán tin của A (403), A đánh dấu đã bán; B rút tin chờ duyệt về nháp.
 *
 *   pnpm smoke:posting [-- --base <url>] [--category <id>] [--mail-log <tệp>] [--allow-remote]
 *
 * Mã xác nhận email đọc từ mailpit (`MAILPIT_URL`, mặc định http://localhost:8025); không có mailpit thì đọc tệp thư
 * của stub SMTP (`--mail-log`, mặc định `<thư mục tạm>/ghim-dev-mail.log`). Ghi dữ liệu thật — hai tài khoản
 * `khoi.*@example.com`, hai tin, hai ảnh — vào DB và kho của server đó; không chạy trên production. Thoát 1 khi một
 * điều mong đợi không đúng.
 */

const base = argOf('base') ?? `http://localhost:${env.PORT}`;
const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const mailLog = argOf('mail-log') ?? join(tmpdir(), 'ghim-dev-mail.log');
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
if (env.NODE_ENV === 'production') {
  process.stderr.write('Không chạy khói khi NODE_ENV=production — lượt này ghi dữ liệu thật.\n');
  process.exit(2);
}
if (!LOCAL.has(new URL(base).hostname) && !hasFlag('allow-remote')) {
  usage('pnpm smoke:posting -- --base <url> --allow-remote   (server không ở máy này)');
}

// Client riêng, không in câu query: client dùng chung của app bật log query ở dev, làm ngập kết quả.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 2 }),
  log: ['warn', 'error'],
});

const runId = randomBytes(4).toString('hex');
const started = Date.now();
const failures: string[] = [];

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const at = (): string => `${String(Date.now() - started).padStart(6)} ms`;
const step = (label: string, detail: string): void => out(`[${at()}] ${label} — ${detail}`);
const check = (ok: boolean, label: string, detail = ''): void => {
  out(`           ${ok ? '✔' : '✘'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
};
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Đọc lại mỗi `everyMs` tới khi `done` đúng hay quá `timeoutMs`; trả lần đọc cuối. */
async function poll<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  everyMs: number,
  timeoutMs: number,
  since = Date.now(),
): Promise<T> {
  const value = await read();
  if (done(value) || Date.now() - since >= timeoutMs) return value;
  await sleep(everyMs);
  return poll(read, done, everyMs, timeoutMs, since);
}

class SmokeError extends Error {}

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────

interface Reply {
  status: number;
  body: unknown;
  ms: number;
}

async function api(
  method: string,
  path: string,
  options: { token?: string; body?: object; device?: string } = {},
): Promise<Reply> {
  const begin = Date.now();
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.device ? { 'x-device-id': options.device } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, ms: Date.now() - begin };
}

function dataOf<T>(reply: Reply, status: number, label: string): T {
  if (reply.status !== status) {
    throw new SmokeError(
      `${label}: HTTP ${reply.status} ${JSON.stringify(reply.body).slice(0, 500)}`,
    );
  }
  return (reply.body as { data: T }).data;
}

// ── DỮ LIỆU NỀN ──────────────────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  templateVersion: number | null;
}
interface Place {
  code: number;
  name: string;
}
interface OwnListing {
  id: string;
  ownerId: string;
  version: number;
  state: string;
  restrictions: string[];
  hideReasons: string[];
  images: { id: string }[];
}
interface UploadGrant {
  imageId: string;
  upload: {
    method: 'PUT' | 'POST';
    url: string;
    headers: Record<string, string>;
    fields?: Record<string, string>;
  };
}

/** Danh mục chỉ định; không thì danh mục chưa có mẫu thông tin, ưu tiên danh mục thử ("thử" trong tên) của dev. */
async function pickCategory(): Promise<Category> {
  const categories = dataOf<Category[]>(await api('GET', '/categories'), 200, 'Đọc danh mục');
  const wanted = argOf('category');
  const plain = categories.filter((category) => category.templateVersion === null);
  const chosen = wanted
    ? categories.find((category) => category.id === wanted)
    : (plain.find((category) => /thử/i.test(category.name)) ?? plain[0]);
  if (!chosen) throw new SmokeError('Không có danh mục dùng được — truyền --category <id>');
  return chosen;
}

async function pickRegion(): Promise<{ province: Place; ward: Place }> {
  const provinces = dataOf<Place[]>(await api('GET', '/regions/provinces'), 200, 'Đọc tỉnh');
  const province = provinces[0];
  if (!province) throw new SmokeError('Bảng tỉnh rỗng');
  const wards = dataOf<Place[]>(
    await api('GET', `/regions/provinces/${province.code}/wards`),
    200,
    'Đọc phường xã',
  );
  const ward = wards[0];
  if (!ward) throw new SmokeError(`Tỉnh ${province.name} không có phường xã`);
  return { province, ward };
}

/** Ảnh nhiễu ngẫu nhiên: không trùng ảnh nào đã có trong kho, nên chỉ B (dùng lại đúng ảnh này) dính "ảnh trùng". */
async function noiseJpeg(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const pixels = randomBytes(width * height * 3);
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// ── NGƯỜI ĐĂNG ───────────────────────────────────────────────────────────────────────────────────

async function verificationCode(email: string): Promise<string> {
  const read = async (): Promise<string | null> =>
    (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
      .then(async (res) => (res.ok ? codeFromMailpit(await res.json()) : null))
      .catch(() => null)) ??
    readFile(mailLog, 'utf8')
      .then((log) => codeFromMailLog(log, email))
      .catch(() => null);
  const code = await poll(read, (value) => value !== null, 500, 20_000);
  if (code) return code;
  throw new SmokeError(
    `Không thấy thư xác nhận gửi ${email} — bật mailpit (pnpm mail:up) hay chỉ --mail-log tới tệp thư của stub SMTP`,
  );
}

interface Poster {
  label: string;
  accountId: string;
  token: string;
  device: string;
}

async function newPoster(label: string): Promise<Poster> {
  const email = `khoi.${label.toLowerCase()}.${runId}@example.com`;
  const password = `Khoi-${runId}-${randomBytes(6).toString('hex')}`;
  const registered = await api('POST', '/auth/register', {
    body: { email, password, displayName: `Người thử khói ${label}` },
  });
  const { accountId } = dataOf<{ accountId: string }>(registered, 201, `Đăng ký ${label}`);
  const verified = await api('POST', '/auth/verify-email', {
    body: { email, code: await verificationCode(email) },
  });
  if (verified.status !== 200 && verified.status !== 204) {
    throw new SmokeError(`Xác nhận email ${label}: HTTP ${verified.status}`);
  }
  const login = await api('POST', '/auth/login', {
    body: { email, password, deviceName: `Máy thử khói ${label}` },
  });
  const { accessToken } = dataOf<{ accessToken: string }>(login, 200, `Đăng nhập ${label}`);
  step(`Tài khoản ${label}`, `${email}, đăng ký ${registered.ms} ms, đăng nhập ${login.ms} ms`);
  return { label, accountId, token: accessToken, device: `may-khoi-${label}-${runId}` };
}

/** Làm theo `upload.method` như app (docs/media.md bước 3): POST biểu mẫu (Cloudinary) hay PUT thân tệp (S3). */
async function upload(grant: UploadGrant, jpeg: Buffer): Promise<void> {
  const { method, url, headers, fields } = grant.upload;
  let res: Response;
  if (method === 'POST') {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value);
    form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'anh.jpg');
    res = await fetch(url, { method, body: form, headers });
  } else {
    res = await fetch(url, { method, body: new Uint8Array(jpeg), headers });
  }
  if (!res.ok)
    throw new SmokeError(`Tải ảnh lên kho: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function postListing(
  poster: Poster,
  jpeg: Buffer,
  context: { category: Category; province: Place; ward: Place },
): Promise<OwnListing> {
  const as = { token: poster.token, device: poster.device };
  let listing = dataOf<OwnListing>(
    await api('POST', '/listings', { ...as, body: {} }),
    201,
    `Tạo nháp ${poster.label}`,
  );
  const granted = await api('POST', '/media/uploads', {
    ...as,
    body: {
      ownerKind: 'listing',
      ownerId: listing.id,
      contentType: 'image/jpeg',
      byteSize: jpeg.length,
    },
  });
  const grant = dataOf<UploadGrant>(granted, 201, `Xin quyền tải ảnh ${poster.label}`);
  const uploadStart = Date.now();
  await upload(grant, jpeg);
  const uploadMs = Date.now() - uploadStart;
  const saved = await api('PATCH', `/listings/${listing.id}`, {
    ...as,
    body: {
      version: listing.version,
      title: `Xe đạp thể thao còn mới, chạy khói ${runId}`,
      description: 'Tin thử của lượt chạy khói luồng đăng tin.',
      price: 2_500_000,
      categoryId: context.category.id,
      placement: 'marketplace',
      provinceCode: context.province.code,
      wardCode: context.ward.code,
      imageIds: [grant.imageId],
    },
  });
  listing = dataOf<OwnListing>(saved, 200, `Lưu nháp ${poster.label}`);
  const submitted = await api('POST', `/listings/${listing.id}/submit`, {
    ...as,
    body: { version: listing.version },
  });
  listing = dataOf<OwnListing>(submitted, 200, `Gửi tin ${poster.label}`);
  step(
    `Tin của ${poster.label}`,
    `${listing.id}: tải ảnh ${uploadMs} ms, lưu nháp ${saved.ms} ms, gửi ${submitted.ms} ms → ${listing.state}`,
  );
  return waitForMachine(poster, listing.id);
}

/** Đọc lại tin tới khi rời "đang kiểm" (máy cho qua hay giữ), tối đa 2 phút. */
async function waitForMachine(poster: Poster, id: string): Promise<OwnListing> {
  const as = { token: poster.token, device: poster.device };
  const waitStart = Date.now();
  const listing = await poll(
    async () =>
      dataOf<OwnListing>(await api('GET', `/listings/${id}`, as), 200, `Đọc tin ${poster.label}`),
    (current) => current.state !== 'checking',
    1000,
    120_000,
  );
  step(
    `Máy duyệt tin của ${poster.label}`,
    `sau ${Date.now() - waitStart} ms: ${listing.state}, hạn chế [${listing.restrictions.join(', ')}]`,
  );
  return listing;
}

// ── KIỂM ─────────────────────────────────────────────────────────────────────────────────────────

const ids = (body: unknown): string[] =>
  ((body as { data?: { items?: { id: string }[] } }).data?.items ?? []).map((item) => item.id);

async function checkRestrictedVisibility(listing: OwnListing): Promise<void> {
  const guest = await api('GET', `/listings/${listing.id}`);
  check(guest.status === 200, 'khách mở link trực tiếp', `HTTP ${guest.status}`);
  const search = await api(
    'GET',
    `/listings?q=${encodeURIComponent(`chạy khói ${runId}`)}&limit=20`,
  );
  check(ids(search.body).includes(listing.id), 'tìm theo từ khoá thấy tin');
  const profile = await api('GET', `/users/${listing.ownerId}/listings`);
  check(ids(profile.body).includes(listing.id), 'hồ sơ người bán có tin');
  const feed = await api('GET', '/listings?limit=50');
  check(!ids(feed.body).includes(listing.id), 'bảng tin chung không có tin hạn chế');
}

interface Hit {
  code: string;
  refs?: string[];
}

async function checkHeld(held: OwnListing): Promise<void> {
  const guest = await api('GET', `/listings/${held.id}`);
  check(guest.status === 404, 'khách mở link tin chờ duyệt nhận 404', `HTTP ${guest.status}`);
  const run = await db.screeningRun.findFirst({
    // Lượt mở lúc gửi mang phiên bản lúc đó; quyết định của máy tăng phiên bản tin — lấy lượt gửi mới nhất.
    where: { listingId: held.id, trigger: 'submission' },
    orderBy: { startedAt: 'desc' },
    select: { outcome: true, cause: true, hits: true },
  });
  const duplicate = ((run?.hits ?? []) as unknown as Hit[]).find(
    (hit) => hit.code === 'duplicate_image',
  );
  check(
    run?.outcome === 'hold' && run.cause === 'gate',
    'máy giữ vì cổng cứng',
    `${run?.outcome ?? '—'} / ${run?.cause ?? '—'}`,
  );
  // `refs` là ảnh CỦA TIN BỊ GIỮ bị coi là trùng — "trùng với tin nào" không lưu, màn xử việc tính lại.
  check(
    duplicate?.refs?.includes(held.images[0]?.id ?? '') ?? false,
    'cổng "ảnh trùng" chỉ đúng ảnh của B',
  );
  // Việc sinh từ sự kiện đổi trạng thái tin: bộ phát outbox quét mỗi 10 giây, có thể qua hai chặng.
  const waitStart = Date.now();
  const task = await poll(
    () =>
      db.reviewTask.findFirst({
        where: { listingId: held.id, status: 'open' },
        select: { reasons: true, dueAt: true },
      }),
    (row) => row !== null,
    2000,
    45_000,
  );
  check(
    task?.reasons.includes('machine_hold') ?? false,
    'hàng chờ có việc "máy giữ"',
    task
      ? `sau ${Date.now() - waitStart} ms, hạn ${task.dueAt.toISOString()}`
      : 'không thấy sau 45 s',
  );
  // N43 (notify-listing-decisions): người đăng được báo tin đang chờ — câu chung, không nói tín hiệu cụ thể.
  const notice = await poll(
    () =>
      db.notification.findFirst({
        where: { recipientId: held.ownerId, type: 'listing.machine.hold' },
        select: { body: true, detail: true, alert: true },
      }),
    (row) => row !== null,
    2000,
    45_000,
  );
  const text = `${notice?.body ?? ''} ${notice?.detail ?? ''}`;
  check(
    notice !== null &&
      notice.alert &&
      text.includes('Tin cần kiểm tra an toàn thêm') &&
      !/trùng/i.test(text),
    'B nhận thông báo "tin đang chờ người duyệt" (câu chung, không nói ảnh trùng)',
    notice ? notice.body : 'không thấy sau 45 s',
  );
}

/**
 * A sửa tin đang hiển thị — spec listing/editing. Chạy trước khi B chép ảnh; lượt sửa sau khi bị chép kiểm ở
 * `checkOwnerArrows` (người đăng trước thắng — duplicate-image-first-wins).
 */
async function checkOwnerEdits(poster: Poster, start: OwnListing): Promise<OwnListing> {
  const asA = { token: poster.token, device: poster.device };
  let listing = start;

  const light = await api('PATCH', `/listings/${listing.id}`, {
    ...asA,
    body: { version: listing.version, delivery: true },
  });
  listing = dataOf<OwnListing>(light, 200, 'Bật giao tận nơi');
  check(
    listing.state === 'live',
    'bật "giao tận nơi": tin vẫn hiển thị, không qua máy',
    listing.state,
  );

  const priced = await api('PATCH', `/listings/${listing.id}`, {
    ...asA,
    body: { version: listing.version, price: 2_300_000 },
  });
  listing = dataOf<OwnListing>(priced, 200, 'Sửa giá');
  check(listing.state === 'checking', 'sửa giá tin đang hiển thị: qua máy lại', listing.state);
  const hidden = await api('GET', `/listings/${listing.id}`);
  check(hidden.status === 404, 'người lạ không thấy tin đang kiểm lại', `HTTP ${hidden.status}`);
  listing = await waitForMachine(poster, listing.id);
  check(listing.state === 'live', 'máy cho qua bản đã sửa', listing.state);
  return listing;
}

/** Mũi tên của người đăng trên tin của A (đang hiển thị) và B (chờ duyệt) — spec listing/lifecycle. */
async function checkOwnerArrows(
  a: { poster: Poster; listing: OwnListing },
  b: { poster: Poster; listing: OwnListing },
): Promise<void> {
  const asA = { token: a.poster.token, device: a.poster.device };
  const asB = { token: b.poster.token, device: b.poster.device };

  // Chủ ảnh sửa tin sau khi bị chép: bản chép kiểm xong sau nên không làm tin của A thành "ảnh trùng".
  const repriced = await api('PATCH', `/listings/${a.listing.id}`, {
    ...asA,
    body: { version: a.listing.version, price: 2_200_000 },
  });
  dataOf<OwnListing>(repriced, 200, 'Sửa giá sau khi bị chép');
  const listing = await waitForMachine(a.poster, a.listing.id);
  check(
    listing.state === 'live',
    'A sửa tin sau khi B chép ảnh: vẫn qua, không dính "ảnh trùng"',
    listing.state,
  );

  const stranger = await api('POST', `/listings/${listing.id}/sold`, asB);
  const stillLive = dataOf<OwnListing>(
    await api('GET', `/listings/${listing.id}`, asA),
    200,
    'Đọc tin A',
  );
  check(
    stranger.status === 403 && stillLive.state === 'live',
    'người khác đánh dấu đã bán: 403, tin vẫn hiển thị',
    `HTTP ${stranger.status}, ${stillLive.state}`,
  );
  const sold = dataOf<OwnListing>(
    await api('POST', `/listings/${listing.id}/sold`, asA),
    200,
    'Đánh dấu đã bán',
  );
  check(sold.state === 'sold', 'chủ tin đánh dấu đã bán', sold.state);

  const withdrawn = dataOf<OwnListing>(
    await api('POST', `/listings/${b.listing.id}/withdraw`, asB),
    200,
    'Rút tin chờ duyệt',
  );
  check(withdrawn.state === 'draft', 'B rút tin chờ duyệt về nháp', withdrawn.state);
}

// ── CHẠY ─────────────────────────────────────────────────────────────────────────────────────────

try {
  out(`Chạy khói luồng đăng tin trên ${base} (mã lượt ${runId})`);
  const [category, region, jpeg] = await Promise.all([pickCategory(), pickRegion(), noiseJpeg()]);
  const context = { category, ...region };
  step('Dữ liệu nền', `danh mục "${category.name}", ${region.province.name} / ${region.ward.name}`);

  const posterA = await newPoster('A');
  const first = await postListing(posterA, jpeg, context);
  check(first.state === 'live', 'tin của A lên bảng', first.state);
  check(first.restrictions.includes('new_account'), 'tin của A mang hạn chế "tài khoản mới" (T0)');
  await checkRestrictedVisibility(first);
  const edited = await checkOwnerEdits(posterA, first);

  const posterB = await newPoster('B');
  const second = await postListing(posterB, jpeg, context);
  check(second.state === 'pending', 'tin của B (ảnh trùng) bị máy giữ', second.state);
  await checkHeld(second);

  await checkOwnerArrows(
    { poster: posterA, listing: edited },
    { poster: posterB, listing: second },
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  process.stderr.write(
    `${error instanceof SmokeError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
} finally {
  await db.$disconnect();
}

out(
  failures.length === 0
    ? `XONG sau ${at().trim()}: mọi điều mong đợi đều đúng.`
    : `HỎNG ${failures.length} điều: ${failures.join('; ')}`,
);
out(
  `Dữ liệu thử để lại: tài khoản khoi.a.${runId}@example.com, khoi.b.${runId}@example.com và tin, ảnh của họ.`,
);
if (failures.length > 0) process.exitCode = 1;
