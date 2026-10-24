import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';

import { hamming } from '../src/modules/screening/calc/dhash.calc.js';
import { sharpInspector } from '../src/modules/screening/run/image-inspector.js';

/* Phép đo ảnh của lượt kiểm ảnh (design add-image-quality-checks mục 1) trên ảnh dựng bằng `sharp`, không cần kho. */
const gray = (width: number, height: number, pixel: (x: number, y: number) => number) => {
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data[y * width + x] = pixel(x, y);
  }
  return sharp(data, { raw: { width, height, channels: 1 } });
};
const png = async (image: Sharp) => new Uint8Array(await image.png().toBuffer());
/** Ô cờ 16 px: cạnh sắc khắp ảnh. */
const checker = (x: number, y: number) =>
  (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? 40 : 210;

describe('sharpInspector', () => {
  it('ảnh đen: độ sáng 0, không nét; ảnh trắng: độ sáng 255', async () => {
    const black = await sharpInspector.inspect(await png(gray(600, 400, () => 0)));
    expect(black).toMatchObject({ width: 600, height: 400, brightness: 0, sharpness: 0 });
    const white = await sharpInspector.inspect(await png(gray(600, 400, () => 255)));
    expect(white.brightness).toBe(255);
  });

  it('ô cờ sắc: độ nét cao; cùng ảnh đó làm mờ: độ nét giảm hẳn, dHash gần như giữ nguyên', async () => {
    const crisp = await sharpInspector.inspect(await png(gray(800, 800, checker)));
    const blurred = await sharpInspector.inspect(await png(gray(800, 800, checker).blur(12)));
    expect(crisp.sharpness).toBeGreaterThan(500);
    expect(blurred.sharpness).toBeLessThan(crisp.sharpness / 10);
    expect(hamming(crisp.dhash, blurred.dhash)).toBeLessThanOrEqual(4);
  });

  it('JPEG xoay 90° theo EXIF: rộng, cao là của ảnh đã xoay', async () => {
    const rotated = new Uint8Array(
      await gray(900, 500, checker).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    );
    expect(await sharpInspector.inspect(rotated)).toMatchObject({ width: 500, height: 900 });
  });

  it('PNG trong suốt: phủ nền trắng trước khi đo', async () => {
    const transparent = new Uint8Array(
      await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    );
    expect((await sharpInspector.inspect(transparent)).brightness).toBe(255);
  });

  it('tệp không phải ảnh: ném', async () => {
    await expect(sharpInspector.inspect(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow();
  });
});
