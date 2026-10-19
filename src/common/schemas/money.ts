import { z } from 'zod';

/**
 * Tiền qua API là NUMBER (số nguyên đồng), trong code là `bigint`.
 *
 * JSON không có kiểu bigint: để nguyên thì `JSON.stringify` ném lỗi ngay endpoint đầu tiên trả
 * tiền. Chọn number thay vì chuỗi vì frontend cộng trừ, format được ngay; `z.number().int()` của
 * Zod 4 chỉ nhận số nguyên AN TOÀN (≤ 2^53 − 1 ≈ 9 triệu tỷ đồng), nên không có số nào bị làm
 * tròn lặng lẽ khi đi qua JSON.
 *
 * Là codec chứ không phải `transform`, vì một schema phải chạy được cả hai chiều:
 * `fastify-type-provider-zod` DECODE request (number → bigint) và ENCODE response
 * (bigint → number). Số vượt ngưỡng an toàn ở response làm serializer hỏng → 500, không trả số sai.
 *
 * `.meta` để Swagger mô tả được response: phía output của codec là bigint, thứ JSON Schema không
 * biểu diễn được.
 */
function moneyCodec(input: z.ZodNumber, output: z.ZodBigInt) {
  return z
    .codec(input, output, {
      decode: (value) => BigInt(value),
      encode: (value) => Number(value),
    })
    .meta({ type: 'integer', description: 'Số tiền, đơn vị đồng' });
}

/**
 * Giá tin đăng, trần giá và giá tham chiếu của danh mục — đều không âm. Ghim không giữ tiền của ai
 * nên không có tiền âm (dòng đảo, công nợ); `0` nghĩa là cho tặng, không phải "chưa nhập giá".
 */
export const priceSchema = moneyCodec(
  z.number().int('Giá phải là số nguyên, tính bằng đồng.').nonnegative('Giá không được âm.'),
  z.bigint().nonnegative(),
);

/** Giá trả trong hội thoại (add-price-offers): như giá tin nhưng phải lớn hơn 0 — trả 0 đồng không phải một lời đề nghị. */
export const offerAmountSchema = moneyCodec(
  z.number().int('Giá phải là số nguyên, tính bằng đồng.').positive('Giá trả phải lớn hơn 0.'),
  z.bigint().positive(),
);

/** "12.000.000 ₫" — câu thông báo và bản ghi cho người xử nêu số tiền như người Việt đọc. */
export const formatMoneyVN = (amount: bigint): string => `${amount.toLocaleString('vi-VN')} ₫`;
