import type { Image, ImageOwnerKind, Prisma, PrismaClient } from '@prisma/client';

import { appendEvents } from '../../common/outbox/outbox.js';
import { MEDIA_EVENTS } from './media.schema.js';

type Tx = Prisma.TransactionClient;

/**
 * Xoá dòng ảnh và phát `media.images.deleted` cùng transaction: module giữ dữ liệu theo mã ảnh (dấu ảnh của
 * `screening`) dọn theo — không FK chéo module (rà soát L10, change fix-audit-trust-media-low). Trả mã đã xoá.
 */
async function deleteAnnounced(
  prisma: PrismaClient,
  remove: (tx: Tx) => Promise<{ id: string }[]>,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const ids = (await remove(tx)).map((row) => row.id);
    if (ids.length > 0) {
      await appendEvents(tx, [{ type: MEDIA_EVENTS.imagesDeleted, payload: { imageIds: ids } }]);
    }
    return ids;
  });
}

export interface ImageOwner {
  kind: ImageOwnerKind;
  id: string;
}

export interface MediaRepository {
  /**
   * Ghi dòng ảnh lúc cấp quyền tải. Đếm lượt trong giờ và ghi nằm sau một khoá theo người xin: hai lượt song song
   * không vượt trần. `'limit'` = đã đủ lượt.
   */
  createImage(input: {
    owner: ImageOwner;
    uploaderId: string;
    contentType: string;
    byteSize: number;
    at: Date;
    since: Date;
    maxPerHour: number;
  }): Promise<Image | 'limit'>;
  findImages(ids: string[]): Promise<Image[]>;
  markUploaded(ids: string[], at: Date): Promise<void>;
  /**
   * Chạy TRONG transaction lưu của chủ (design mục 6): khoá dòng ảnh của chủ, gỡ nhãn ảnh trong danh sách, đánh dấu
   * bỏ ảnh đã xác nhận không còn trong danh sách. `false` = có ảnh đã biến mất (lượt dọn chạy trước) hay chưa tải
   * xong — chủ quay lui.
   */
  attach(tx: Tx, input: { owner: ImageOwner; imageIds: string[]; at: Date }): Promise<boolean>;
  deleteUnconfirmedBefore(cutoff: Date, limit: number): Promise<string[]>;
  deleteReleased(limit: number): Promise<string[]>;
  /** Mã nào trong danh sách còn dòng. */
  existingIds(ids: string[]): Promise<Set<string>>;
  /** Ảnh đã từng thấy trong kho và chưa bị bỏ, mã trong `(after, upto]` — `upto` null là tới hết. */
  trackedBetween(after: string | null, upto: string | null): Promise<Image[]>;
  recordMissing(images: Image[]): Promise<void>;
  /** Mã cho ảnh sắp chép: phải có trước khi chép tệp, vì khoá trong kho là mã ảnh. */
  newImageIds(count: number): Promise<string[]>;
  /** Dòng của bản sao, đã thấy trong kho và đã xác nhận — tệp đã chép trước transaction. */
  insertCopies(
    tx: Tx,
    copies: { id: string; source: Image; owner: ImageOwner; uploaderId: string }[],
    at: Date,
  ): Promise<void>;
  /** Mã chủ khác nhau của một loại chủ, theo thứ tự, sau `after` — lượt đối chiếu hỏi chủ còn không theo trang. */
  ownerIdsAfter(kind: ImageOwnerKind, after: string | null, limit: number): Promise<string[]>;
  deleteByOwners(kind: ImageOwnerKind, ownerIds: string[]): Promise<string[]>;
}

export function createMediaRepository(prisma: PrismaClient): MediaRepository {
  return {
    createImage: ({ owner, uploaderId, contentType, byteSize, at, since, maxPerHour }) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`media-upload:${uploaderId}`}, 0))`;
        const used = await tx.image.count({ where: { uploaderId, createdAt: { gte: since } } });
        if (used >= maxPerHour) return 'limit';
        return tx.image.create({
          data: {
            ownerKind: owner.kind,
            ownerId: owner.id,
            uploaderId,
            contentType,
            byteSize,
            createdAt: at,
          },
        });
      }),

    findImages: (ids) => prisma.image.findMany({ where: { id: { in: ids } } }),

    async markUploaded(ids, at) {
      if (ids.length === 0) return;
      await prisma.image.updateMany({
        where: { id: { in: ids }, uploadedAt: null },
        data: { uploadedAt: at },
      });
    },

    async attach(tx, { owner, imageIds, at }) {
      // Khoá trước khi đọc: lượt dọn xoá cùng dòng phải chờ, và Postgres xét lại điều kiện xoá sau khi khoá nhả.
      const rows = await tx.$queryRaw<{ id: string; uploaded_at: Date | null }[]>`
        SELECT id::text, uploaded_at FROM images
        WHERE owner_kind = ${owner.kind}::image_owner_kind AND owner_id = ${owner.id}::uuid
        FOR UPDATE`;
      const uploaded = new Set(rows.filter((row) => row.uploaded_at !== null).map((row) => row.id));
      if (imageIds.some((id) => !uploaded.has(id))) return false;
      const ofOwner = { ownerKind: owner.kind, ownerId: owner.id };
      await tx.image.updateMany({
        where: { ...ofOwner, id: { in: imageIds }, confirmedAt: null },
        data: { confirmedAt: at },
      });
      // Chọn lại một ảnh đã bỏ (còn trong kho tới lượt đối chiếu) thì nó lại là ảnh đang dùng.
      await tx.image.updateMany({
        where: { ...ofOwner, id: { in: imageIds }, releasedAt: { not: null } },
        data: { releasedAt: null },
      });
      await tx.image.updateMany({
        where: {
          ...ofOwner,
          id: { notIn: imageIds },
          confirmedAt: { not: null },
          releasedAt: null,
        },
        data: { releasedAt: at },
      });
      return true;
    },

    deleteUnconfirmedBefore: (cutoff, limit) =>
      deleteAnnounced(
        prisma,
        (tx) => tx.$queryRaw<{ id: string }[]>`
          DELETE FROM images WHERE id IN (
            SELECT id FROM images WHERE confirmed_at IS NULL AND created_at < ${cutoff} LIMIT ${limit}
          ) AND confirmed_at IS NULL
          RETURNING id::text`,
      ),

    deleteReleased: (limit) =>
      deleteAnnounced(
        prisma,
        (tx) => tx.$queryRaw<{ id: string }[]>`
          DELETE FROM images WHERE id IN (
            SELECT id FROM images WHERE released_at IS NOT NULL LIMIT ${limit}
          ) AND released_at IS NOT NULL
          RETURNING id::text`,
      ),

    async existingIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await prisma.image.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },

    trackedBetween: (after, upto) =>
      prisma.image.findMany({
        where: {
          uploadedAt: { not: null },
          releasedAt: null,
          id: { ...(after ? { gt: after } : {}), ...(upto ? { lte: upto } : {}) },
        },
        orderBy: { id: 'asc' },
      }),

    async newImageIds(count) {
      if (count === 0) return [];
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT uuidv7()::text AS id FROM generate_series(1, ${count})`;
      return rows.map((row) => row.id);
    },

    async insertCopies(tx, copies, at) {
      if (copies.length === 0) return;
      await tx.image.createMany({
        data: copies.map(({ id, source, owner, uploaderId }) => ({
          id,
          ownerKind: owner.kind,
          ownerId: owner.id,
          uploaderId,
          contentType: source.contentType,
          byteSize: source.byteSize,
          uploadedAt: at,
          confirmedAt: at,
          createdAt: at,
        })),
      });
    },

    async ownerIdsAfter(kind, after, limit) {
      const rows = await prisma.image.findMany({
        where: { ownerKind: kind, ...(after ? { ownerId: { gt: after } } : {}) },
        distinct: ['ownerId'],
        orderBy: { ownerId: 'asc' },
        take: limit,
        select: { ownerId: true },
      });
      return rows.map((row) => row.ownerId);
    },

    async deleteByOwners(kind, ownerIds) {
      if (ownerIds.length === 0) return [];
      return deleteAnnounced(
        prisma,
        (tx) => tx.$queryRaw<{ id: string }[]>`
          DELETE FROM images WHERE owner_kind = ${kind}::image_owner_kind AND owner_id = ANY(${ownerIds}::uuid[])
          RETURNING id::text`,
      );
    },

    async recordMissing(images) {
      if (images.length === 0) return;
      await prisma.$transaction((tx) =>
        appendEvents(
          tx,
          images.map((image) => ({
            type: MEDIA_EVENTS.imageMissing,
            payload: { imageId: image.id, ownerKind: image.ownerKind, ownerId: image.ownerId },
          })),
        ),
      );
    },
  };
}
