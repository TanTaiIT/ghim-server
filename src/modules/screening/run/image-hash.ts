import sharp from 'sharp';

import { dhashFromGray, HASH_HEIGHT, HASH_WIDTH } from '../calc/dhash.calc.js';
import type { ImageHasher } from '../screening.shared.js';

/**
 * dHash qua `sharp` (design mục 3): xoay theo EXIF, phủ nền trắng lên kênh trong suốt, thu về 9×8 một kênh xám — ảnh chép
 * lại hay nén lại ra cùng mã, hoặc lệch vài bit.
 */
export const sharpHasher: ImageHasher = {
  async dhash(bytes) {
    const pixels = await sharp(bytes)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
      .toColourspace('b-w')
      .raw()
      .toBuffer();
    return dhashFromGray(pixels);
  },
};
