/**
 * dHash 64 bit (design add-screening mục 3): ảnh thu về 9×8 xám, mỗi bit = điểm ảnh bên trái sáng hơn bên phải. Phần
 * giải mã ảnh nằm sau cổng (`sharp`); ở đây chỉ phép tính trên điểm ảnh, để test không cần ảnh thật.
 */
export const HASH_WIDTH = 9;
export const HASH_HEIGHT = 8;

/** Năm dải 13, 13, 13, 13, 12 bit: hai ảnh lệch ≤ 4 bit chắc chắn trùng nguyên ít nhất một dải. */
const BAND_BITS = [13, 13, 13, 13, 12] as const;

export function dhashFromGray(pixels: Uint8Array | readonly number[]): bigint {
  if (pixels.length !== HASH_WIDTH * HASH_HEIGHT) {
    throw new Error(`dHash cần ${HASH_WIDTH * HASH_HEIGHT} điểm ảnh xám, nhận ${pixels.length}`);
  }
  let hash = 0n;
  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    for (let col = 0; col < HASH_WIDTH - 1; col += 1) {
      const left = pixels[row * HASH_WIDTH + col] ?? 0;
      const right = pixels[row * HASH_WIDTH + col + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

export function bandsOf(hash: bigint): number[] {
  const unsigned = BigInt.asUintN(64, hash);
  let shift = 64n;
  return BAND_BITS.map((bits) => {
    shift -= BigInt(bits);
    return Number((unsigned >> shift) & ((1n << BigInt(bits)) - 1n));
  });
}

export function hamming(a: bigint, b: bigint): number {
  let diff = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/** Cột `bigint` của Postgres có dấu: lưu dạng có dấu, so khoảng cách trên dạng không dấu — cùng 64 bit. */
export const toStored = (hash: bigint): bigint => BigInt.asIntN(64, hash);
