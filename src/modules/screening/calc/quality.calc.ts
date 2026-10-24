import type { QualityCode } from '../screening.rules.js';

/** Số đo chất lượng của một ảnh (add-image-quality-checks): cỡ sau khi xoay theo EXIF, độ nét, độ sáng 0–255. */
export interface ImageQuality {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
}

/**
 * Ngưỡng của bảng con số mà lượt gửi đọc lúc chấm chữ — kết luận lúc ảnh về vẫn theo đúng các số này (design mục 2).
 * `type` chứ không `interface`: nằm trong cột jsonb `text_result`.
 */
export type QualityLimits = {
  minShortSide: number;
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
};

/** Luật chất lượng một ảnh trúng. Ảnh hỏng không qua đây: nó là ảnh không có số đo nào. */
export function qualityIssues(image: ImageQuality, limits: QualityLimits): QualityCode[] {
  const issues: QualityCode[] = [];
  if (Math.min(image.width, image.height) < limits.minShortSide) issues.push('image_too_small');
  if (image.sharpness < limits.minSharpness) issues.push('image_blurry');
  if (image.brightness < limits.minBrightness) issues.push('image_too_dark');
  if (image.brightness > limits.maxBrightness) issues.push('image_too_bright');
  return issues;
}

export function meanOf(values: Uint8Array): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Phương sai tổng thể (chia cho số phần tử). */
export function varianceOf(values: Uint8Array): number {
  if (values.length === 0) return 0;
  const mean = meanOf(values);
  let sum = 0;
  for (const value of values) sum += (value - mean) ** 2;
  return sum / values.length;
}
