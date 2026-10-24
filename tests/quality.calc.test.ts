import { describe, expect, it } from 'vitest';

import { meanOf, qualityIssues, varianceOf } from '../src/modules/screening/calc/quality.calc.js';

/* Spec screening/image-checks "Đo chất lượng từng ảnh" — phần so ngưỡng (design add-image-quality-checks mục 2). */
const LIMITS = { minShortSide: 480, minSharpness: 50, minBrightness: 25, maxBrightness: 235 };
const good = { width: 1200, height: 900, sharpness: 400, brightness: 120 };

describe('qualityIssues', () => {
  it('ảnh đạt mọi ngưỡng: không trúng luật nào', () => {
    expect(qualityIssues(good, LIMITS)).toEqual([]);
  });

  it('cạnh ngắn là cạnh nhỏ hơn, dù ảnh dọc hay ngang; đúng ngưỡng thì đạt', () => {
    expect(qualityIssues({ ...good, width: 640, height: 360 }, LIMITS)).toEqual([
      'image_too_small',
    ]);
    expect(qualityIssues({ ...good, width: 360, height: 640 }, LIMITS)).toEqual([
      'image_too_small',
    ]);
    expect(qualityIssues({ ...good, width: 480, height: 2000 }, LIMITS)).toEqual([]);
  });

  it('độ nét dưới ngưỡng: mờ; đúng ngưỡng thì đạt', () => {
    expect(qualityIssues({ ...good, sharpness: 49.9 }, LIMITS)).toEqual(['image_blurry']);
    expect(qualityIssues({ ...good, sharpness: 50 }, LIMITS)).toEqual([]);
  });

  it('độ sáng ngoài khoảng: quá tối hay quá sáng; hai đầu khoảng thì đạt', () => {
    expect(qualityIssues({ ...good, brightness: 24.5 }, LIMITS)).toEqual(['image_too_dark']);
    expect(qualityIssues({ ...good, brightness: 235.5 }, LIMITS)).toEqual(['image_too_bright']);
    expect(qualityIssues({ ...good, brightness: 25 }, LIMITS)).toEqual([]);
    expect(qualityIssues({ ...good, brightness: 235 }, LIMITS)).toEqual([]);
  });

  it('một ảnh trúng nhiều luật cùng lúc', () => {
    expect(qualityIssues({ width: 200, height: 200, sharpness: 0, brightness: 5 }, LIMITS)).toEqual(
      ['image_too_small', 'image_blurry', 'image_too_dark'],
    );
  });
});

describe('meanOf, varianceOf', () => {
  it('trung bình và phương sai tổng thể; mảng rỗng ra 0', () => {
    expect(meanOf(new Uint8Array([0, 10, 20, 30]))).toBe(15);
    expect(varianceOf(new Uint8Array([0, 10, 20, 30]))).toBe(125);
    expect(varianceOf(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(meanOf(new Uint8Array([]))).toBe(0);
    expect(varianceOf(new Uint8Array([]))).toBe(0);
  });
});
