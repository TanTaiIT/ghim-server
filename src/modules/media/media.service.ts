import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import {
  BadRequestError,
  NotFoundError,
  TooManyRequestsError,
} from '../../common/errors/app-error.js';
import { IMAGE_KEY_PREFIX, imageKey, type Storage } from '../../lib/storage.js';
import type { ImageOwner, MediaRepository } from './media.repository.js';

/**
 * Chủ ảnh không phải hồ sơ do module sở hữu chủ trả lời (`listing` cho tin): `media` không đọc bảng của họ. Nối muộn
 * trong `buildApp` vì `listing` dựng sau `media`.
 */
export interface ImageOwnership {
  /** Người xin tải là chủ của chủ ảnh này, và chủ đó còn nhận ảnh (tin của mình, chưa xoá). */
  canUpload(accountId: string, ownerId: string): Promise<boolean>;
  /** Chủ nào trong danh sách còn tồn tại — kể cả đã xoá mềm, vì xoá mềm giữ ảnh (spec image-cleanup). */
  existing(ownerIds: string[]): Promise<Set<string>>;
}
import type { UploadBody, UploadGrantDto } from './media.schema.js';

export interface MediaServiceDeps {
  repository: MediaRepository;
  storage: Storage;
  config: RuntimeConfig;
  clock: () => Date;
  /**
   * Giờ của kho, để so với `lastModified` của tệp. Không phải đồng hồ của app: test cố định đồng hồ app, còn kho ghi
   * giờ thật. Test đẩy giờ này tới trước để một tệp vừa tải trông như đã cũ.
   */
  storageClock?: () => Date;
  owners?: { listing?: ImageOwnership | undefined };
}

export interface ReconcileResult {
  released: number;
  /** Ảnh của chủ đã xoá hẳn (tin) — xoá theo chủ khi bên xoá chủ chưa dọn. */
  ownerGone: number;
  orphans: number;
  missing: number;
  scanned: number;
  /** `null` = đã xét hết kho; không thì lượt sau xét tiếp từ mã này (TK 26 luật 2). */
  next: string | null;
}

export interface MediaService {
  requestUpload(actor: Actor, body: UploadBody): Promise<UploadGrantDto>;
  /**
   * Bước 1 của xác nhận, TRƯỚC transaction lưu của chủ: mọi ảnh phải của đúng chủ, đúng người lưu, đã nằm trong kho
   * (lần đầu thì hỏi kho). Sai bất kỳ điều gì → cùng một lỗi `IMAGE_NOT_IN_STORAGE`, kể cả mã không phải dạng mã.
   */
  resolve(input: { owner: ImageOwner; uploaderId: string; imageIds: string[] }): Promise<void>;
  /** Bước 2, TRONG transaction lưu của chủ: gỡ nhãn, đánh dấu ảnh bị bỏ; ảnh đã bị dọn mất thì ném, chủ quay lui. */
  attach(
    tx: Prisma.TransactionClient,
    input: { owner: ImageOwner; imageIds: string[] },
  ): Promise<void>;
  viewUrl(imageId: string): Promise<string>;
  /** Bytes của ảnh cho máy duyệt băm (design add-screening mục 12); `null` khi kho không còn tệp. */
  readImage(imageId: string): Promise<Uint8Array | null>;
  /**
   * Bản sao ảnh cho tin chuyển lên sàn chung (delta media/image-storage): tệp chép TRƯỚC transaction, dòng ảnh mới
   * (thuộc `to`, đã xác nhận) ghi bằng `commit(tx)` TRONG transaction của chủ. Transaction hỏng thì tệp chép thành mồ
   * côi cho lượt đối chiếu. Ảnh của `from` giữ nguyên chủ và nội dung.
   */
  copyImages(input: {
    from: ImageOwner;
    to: ImageOwner;
    imageIds: string[];
    uploaderId: string;
  }): Promise<{ imageIds: string[]; commit(tx: Prisma.TransactionClient): Promise<void> }>;
  purgeUnconfirmed(): Promise<number>;
  /** Mỗi lượt xét ít nhất một trang rồi mới kiểm trần thời gian, nên lượt nào cũng tiến. */
  reconcile(input: {
    after?: string | undefined;
    budgetMs: number;
    pageSize?: number;
  }): Promise<ReconcileResult>;
  ensureStorage(): Promise<{ created: boolean }>;
}

const HOUR_MS = 3_600_000;
const MINUTE_S = 60;
/** Một trang của lượt dọn và lượt đối chiếu — cũng là trần một lệnh xoá nhiều khoá của chuẩn S3. */
const BATCH = 1000;
const isUuid = (value: string): boolean => z.uuid().safeParse(value).success;

export const imageNotInStorage = (): BadRequestError =>
  new BadRequestError(
    'Ảnh không nằm trong kho của Ghim, hoặc không phải ảnh bạn tải lên cho chỗ này. Tải ảnh lên rồi thử lại.',
    'IMAGE_NOT_IN_STORAGE',
  );

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const { repository, storage, config, clock } = deps;
  const storageClock = deps.storageClock ?? (() => new Date());

  /** Xoá theo trang: dòng trước, tệp sau — tệp xoá hỏng thì thành mồ côi cho lượt đối chiếu, không có dòng trỏ vào tệp đã mất. */
  const drain = async (take: () => Promise<string[]>, done = 0): Promise<number> => {
    const ids = await take();
    await storage.deleteMany(ids.map(imageKey));
    const total = done + ids.length;
    return ids.length === BATCH ? drain(take, total) : total;
  };

  /**
   * Chủ `profile` có khoá ngoại (`uploader_id`) nên tự đi theo tài khoản; chủ `listing` không có, nên hỏi `listing` theo
   * trang những tin nào còn, ảnh của tin đã xoá hẳn thì xoá — dòng trước, tệp sau như mọi lượt dọn.
   */
  const dropOwnerless = async (after: string | null, done = 0): Promise<number> => {
    const port = deps.owners?.listing;
    if (!port) return done;
    const ownerIds = await repository.ownerIdsAfter('listing', after, BATCH);
    if (ownerIds.length === 0) return done;
    const alive = await port.existing(ownerIds);
    const gone = ownerIds.filter((id) => !alive.has(id));
    const deleted = await repository.deleteByOwners('listing', gone);
    await storage.deleteMany(deleted.map(imageKey));
    const total = done + deleted.length;
    return ownerIds.length === BATCH ? dropOwnerless(ownerIds.at(-1) ?? null, total) : total;
  };

  return {
    async requestUpload(actor, body) {
      // Chủ của người khác và chủ không tồn tại trả cùng 404: không lộ tin nào có thật.
      const owns =
        body.ownerKind === 'profile'
          ? body.ownerId === actor.accountId
          : ((await deps.owners?.listing?.canUpload(actor.accountId, body.ownerId)) ?? false);
      if (!owns) throw new NotFoundError('Không có chỗ này để tải ảnh');
      const maxBytes = config.get('media.maxImageBytes');
      if (body.byteSize > maxBytes) {
        throw new BadRequestError(
          `Ảnh tối đa ${Math.floor(maxBytes / 1024 / 1024)} MB — thu nhỏ ảnh rồi thử lại`,
          'VALIDATION_ERROR',
        );
      }
      const now = clock();
      const image = await repository.createImage({
        owner: { kind: body.ownerKind, id: body.ownerId },
        uploaderId: actor.accountId,
        contentType: body.contentType,
        byteSize: body.byteSize,
        at: now,
        since: new Date(now.getTime() - HOUR_MS),
        maxPerHour: config.get('media.uploadGrantsPerHour'),
      });
      if (image === 'limit') {
        throw new TooManyRequestsError(
          'Bạn đã xin tải quá nhiều ảnh trong một giờ — thử lại sau',
          'UPLOAD_LIMIT',
        );
      }
      const grant = await storage.presignUpload({
        key: imageKey(image.id),
        contentType: image.contentType,
        byteSize: image.byteSize,
        ttlSeconds: config.get('media.uploadGrantMinutes') * MINUTE_S,
      });
      return {
        imageId: image.id,
        upload: {
          method: 'PUT',
          url: grant.url,
          headers: grant.headers,
          expiresAt: grant.expiresAt.toISOString(),
        },
      };
    },

    async resolve({ owner, uploaderId, imageIds }) {
      const ids = [...new Set(imageIds)];
      if (ids.some((id) => !isUuid(id))) throw imageNotInStorage();
      const rows = await repository.findImages(ids);
      const usable = rows.filter(
        (row) =>
          row.ownerKind === owner.kind && row.ownerId === owner.id && row.uploaderId === uploaderId,
      );
      if (usable.length !== ids.length) throw imageNotInStorage();
      const pending = usable.filter((row) => row.uploadedAt === null);
      const seen = await Promise.all(pending.map((row) => storage.head(imageKey(row.id))));
      const arrived = pending.filter((row, index) => {
        const object = seen[index];
        return object?.byteSize === row.byteSize && object.contentType === row.contentType;
      });
      if (arrived.length !== pending.length) throw imageNotInStorage();
      await repository.markUploaded(
        arrived.map((row) => row.id),
        clock(),
      );
    },

    async attach(tx, { owner, imageIds }) {
      const attached = await repository.attach(tx, {
        owner,
        imageIds: [...new Set(imageIds)],
        at: clock(),
      });
      if (!attached) throw imageNotInStorage();
    },

    viewUrl: (imageId) =>
      storage.viewUrl(imageKey(imageId), config.get('media.viewUrlMinutes') * MINUTE_S),

    readImage: (imageId) => storage.read(imageKey(imageId), config.get('media.maxImageBytes')),

    async copyImages({ from, to, imageIds, uploaderId }) {
      const rows = await repository.findImages(imageIds);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const sources = imageIds.map((id) => byId.get(id));
      if (
        sources.some(
          (row) =>
            !row || row.ownerKind !== from.kind || row.ownerId !== from.id || !row.uploadedAt,
        )
      ) {
        throw imageNotInStorage();
      }
      const ids = await repository.newImageIds(imageIds.length);
      const copies = sources.flatMap((source, index) => {
        const id = ids[index];
        return source && id ? [{ id, source, owner: to, uploaderId }] : [];
      });
      await Promise.all(
        copies.map(({ id, source }) => storage.copy(imageKey(source.id), imageKey(id))),
      );
      return {
        imageIds: ids,
        commit: (tx) => repository.insertCopies(tx, copies, clock()),
      };
    },

    purgeUnconfirmed() {
      const cutoff = new Date(clock().getTime() - config.get('media.unconfirmedHours') * HOUR_MS);
      return drain(() => repository.deleteUnconfirmedBefore(cutoff, BATCH));
    },

    async reconcile({ after, budgetMs, pageSize = BATCH }) {
      const startedAt = Date.now();
      const released = after ? 0 : await drain(() => repository.deleteReleased(BATCH));
      const ownerGone = after ? 0 : await dropOwnerless(null);
      // Tệp không có dòng nhưng mới hơn hạn một quyền tải thì để yên: lượt xét có thể chạy giữa lúc dòng vừa bị xoá.
      const orphanBefore =
        storageClock().getTime() - config.get('media.uploadGrantMinutes') * MINUTE_S * 1000;
      const result: ReconcileResult = {
        released,
        ownerGone,
        orphans: 0,
        missing: 0,
        scanned: 0,
        next: null,
      };

      const page = async (cursor: string | null): Promise<ReconcileResult> => {
        const listed = await storage.list({
          prefix: IMAGE_KEY_PREFIX,
          after: cursor ? imageKey(cursor) : undefined,
          limit: pageSize,
        });
        const ids = listed.items.map((item) => item.key.slice(IMAGE_KEY_PREFIX.length));
        const uuids = ids.filter(isUuid);
        const known = await repository.existingIds(uuids);
        const orphans = listed.items.filter(
          (item, index) =>
            !known.has(ids[index] ?? '') && item.lastModified.getTime() < orphanBefore,
        );
        await storage.deleteMany(orphans.map((item) => item.key));

        // Hai danh sách cùng xếp theo mã (khoá `img/<uuid>` theo thứ tự chữ = thứ tự uuid của Postgres): dòng nằm trong
        // khoảng của trang này mà không có tệp là ảnh mất.
        // Khoá không phải dạng mã (không do app ghi) chỉ có thể là mồ côi; nó không được làm mốc so trong Postgres.
        const last = ids.at(-1) ?? null;
        const from = cursor && isUuid(cursor) ? cursor : null;
        const present = new Set(uuids);
        const tracked =
          listed.next && uuids.length === 0
            ? []
            : await repository.trackedBetween(from, listed.next ? (uuids.at(-1) ?? null) : null);
        const missing = tracked.filter((row) => !present.has(row.id));
        await repository.recordMissing(missing);

        result.orphans += orphans.length;
        result.missing += missing.length;
        result.scanned += listed.items.length;
        if (!listed.next) return { ...result, next: null };
        return Date.now() - startedAt >= budgetMs ? { ...result, next: last } : page(last);
      };
      return page(after ?? null);
    },

    ensureStorage: () => storage.ensureBucket(),
  };
}
