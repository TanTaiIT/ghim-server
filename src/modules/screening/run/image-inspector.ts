import sharp from 'sharp';

import { dhashFromGray, HASH_HEIGHT, HASH_WIDTH } from '../calc/dhash.calc.js';
import { meanOf, varianceOf } from '../calc/quality.calc.js';
import type { ImageInspector } from '../screening.shared.js';

/** Đo độ nét, độ sáng trên ảnh xám cạnh dài cố định, để ngưỡng không phụ thuộc cỡ ảnh gốc (add-image-quality-checks). */
const MEASURE_LONG_SIDE = 512;
/**
 * Laplace 4 lân cận. `convolve` cắt kết quả về 0–255: dời 128 để giữ phần âm (dời không đổi phương sai). `scale` mặc
 * định là tổng kernel, mà tổng của Laplace là 0.
 */
const LAPLACIAN = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  scale: 1,
  offset: 128,
};

/**
 * Một ảnh, một lần mở (design add-image-quality-checks mục 1): dHash như trước (xoay theo EXIF, nền trắng, 9×8 xám — ảnh
 * chép lại hay nén lại ra cùng mã, hoặc lệch vài bit), cùng cỡ sau khi xoay, độ sáng trung bình và phương sai Laplace.
 * Số đo tính trên buffer điểm ảnh: `stats()` của `sharp` đọc ảnh đầu vào, bỏ qua `convolve` trong pipeline.
 */
export const sharpInspector: ImageInspector = {
  async inspect(bytes) {
    const base = sharp(bytes).rotate().flatten({ background: '#ffffff' });
    const [meta, pixels, gray] = await Promise.all([
      base.metadata(),
      base
        .clone()
        .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
        .toColourspace('b-w')
        .raw()
        .toBuffer(),
      base
        .clone()
        .resize(MEASURE_LONG_SIDE, MEASURE_LONG_SIDE, { fit: 'inside', withoutEnlargement: true })
        .toColourspace('b-w')
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);
    const edges = await sharp(gray.data, {
      raw: { width: gray.info.width, height: gray.info.height, channels: 1 },
    })
      .convolve(LAPLACIAN)
      .raw()
      .toBuffer();
    return {
      dhash: dhashFromGray(pixels),
      width: meta.autoOrient.width,
      height: meta.autoOrient.height,
      sharpness: varianceOf(edges),
      brightness: meanOf(gray.data),
    };
  },
};
