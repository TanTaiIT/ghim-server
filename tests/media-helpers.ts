import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { api, type TestUser } from './group-helpers.js';
import { fakeJpeg, uploadWith } from './storage-helpers.js';

/** Xin quyền tải một ảnh cho hồ sơ của chính người đó — phần thân đè được để thử từng chỗ sai. */
export const requestUpload = (
  app: FastifyInstance,
  user: TestUser,
  body: Record<string, unknown> = {},
): Promise<LightMyRequestResponse> =>
  api(app, 'POST', '/media/uploads', user.token, {
    ownerKind: 'profile',
    ownerId: user.id,
    contentType: 'image/jpeg',
    byteSize: 2048,
    ...body,
  });

/** Xin quyền rồi tải thật lên kho như app — trả mã ảnh. `fill` để phân biệt ruột hai ảnh. */
export async function uploadImage(
  app: FastifyInstance,
  user: TestUser,
  fill = 0xff,
): Promise<string> {
  const granted = await requestUpload(app, user);
  if (granted.statusCode !== 201) {
    throw new Error(`Xin tải hỏng: ${granted.statusCode} ${granted.body}`);
  }
  const { imageId, upload } = granted.json().data as {
    imageId: string;
    upload: { url: string; headers: Record<string, string> };
  };
  const put = await uploadWith(upload, fakeJpeg(2048, fill));
  if (put.status !== 200) throw new Error(`Tải lên kho hỏng: ${put.status}`);
  return imageId;
}

export const setAvatar = (
  app: FastifyInstance,
  user: TestUser,
  body: object,
): Promise<LightMyRequestResponse> => api(app, 'PUT', '/me/avatar', user.token, body);

/** Byte đầu của một đường xem — đủ để biết đúng ảnh nào (mỗi ảnh test tô một byte riêng). */
export async function firstByteAt(url: string): Promise<number | null> {
  const res = await fetch(url);
  if (res.status !== 200) return null;
  return new Uint8Array(await res.arrayBuffer())[0] ?? null;
}
