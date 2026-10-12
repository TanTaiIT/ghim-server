import { describe, expect, it } from 'vitest';

import {
  bandsOf,
  dhashFromGray,
  HASH_HEIGHT,
  HASH_WIDTH,
  hamming,
  toStored,
} from '../src/modules/screening/dhash.calc.js';

/* Spec screening/image-checks, phần thuần (design add-screening mục 3). */
const ALL_ONES = (1n << 64n) - 1n;
const grid = (pixel: (row: number, col: number) => number) =>
  Array.from({ length: HASH_WIDTH * HASH_HEIGHT }, (_, i) =>
    pixel(Math.floor(i / HASH_WIDTH), i % HASH_WIDTH),
  );

/** Sinh số giả ngẫu nhiên cố định — test chạy lại ra cùng dãy. */
const lcg = (seed: bigint) => {
  let state = seed;
  return () => {
    state = (state * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) & ALL_ONES;
    return state;
  };
};

describe('dHash 64 bit', () => {
  it('sáng dần sang phải: mọi bit 0; tối dần sang phải: mọi bit 1', () => {
    expect(dhashFromGray(grid((_, col) => col * 10))).toBe(0n);
    expect(dhashFromGray(grid((_, col) => 255 - col * 10))).toBe(ALL_ONES);
  });

  it('bit đầu là hàng 0, cột 0 so với cột 1', () => {
    const pixels = grid(() => 0);
    pixels[0] = 9;
    expect(dhashFromGray(pixels)).toBe(1n << 63n);
  });

  it('sai kích thước: báo lỗi', () => {
    expect(() => dhashFromGray([1, 2, 3])).toThrow();
  });
});

describe('Năm dải và khoảng cách Hamming', () => {
  it('năm dải 13, 13, 13, 13, 12 bit ghép lại đúng mã', () => {
    expect(bandsOf(ALL_ONES)).toEqual([8191, 8191, 8191, 8191, 4095]);
    const hash = lcg(7n)();
    const rebuilt = bandsOf(hash).reduce(
      (acc, band, i) => (acc << BigInt(i === 4 ? 12 : 13)) | BigInt(band),
      0n,
    );
    expect(rebuilt).toBe(hash);
  });

  it('Hamming: 0 với chính nó, 64 với phần bù, k với k bit lật', () => {
    const hash = lcg(11n)();
    expect(hamming(hash, hash)).toBe(0);
    expect(hamming(hash, hash ^ ALL_ONES)).toBe(64);
    expect(hamming(hash, hash ^ 0b1011n)).toBe(3);
  });

  it('hai ảnh lệch ≤ 4 bit luôn chung ít nhất một dải', () => {
    const next = lcg(42n);
    for (let round = 0; round < 2000; round += 1) {
      const hash = next();
      const flips = Number(next() % 5n);
      let other = hash;
      for (let i = 0; i < flips; i += 1) other ^= 1n << (next() % 64n);
      const [left, right] = [bandsOf(hash), bandsOf(other)];
      expect(left.some((band, i) => band === right[i])).toBe(true);
    }
  });

  it('lưu dạng có dấu cho cột bigint của Postgres, khoảng cách không đổi', () => {
    const stored = toStored(ALL_ONES);
    expect(stored).toBe(-1n);
    expect(BigInt.asUintN(64, stored)).toBe(ALL_ONES);
    expect(hamming(stored, 0n)).toBe(64);
    expect(bandsOf(stored)).toEqual(bandsOf(ALL_ONES));
  });
});
