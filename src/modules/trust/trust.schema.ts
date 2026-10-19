import { z } from 'zod';

import { LISTING_RESTRICTIONS } from '../listing/listing.schema.js';
import { strikeSchema } from './strike/strike.schema.js';

/** Tuple của enum `trust_tier` — đổi enum thì đổi luôn ở đây (CLAUDE.md luật 5). */
export const TRUST_TIER_VALUES = ['T0', 'T1', 'T2', 'T3'] as const;

const iso = z.iso.datetime();

/** Bảng uy tín của người bán (spec trust/seller-dashboard): chỉ chủ tài khoản xem, không nêu tín hiệu gian lận nào. */
export const trustDashboardSchema = z.object({
  tier: z.enum(TRUST_TIER_VALUES),
  countedClean: z.number().int(),
  /** Phiên bản bảng con số của lần tính mức gần nhất (`0` = chưa tính lần nào). */
  configVersion: z.number().int(),
  /** Còn thiếu gì để lên mức kế tiếp; `null` ở T3. */
  next: z
    .object({
      tier: z.enum(TRUST_TIER_VALUES),
      missingDays: z.number().int(),
      missingClean: z.number().int(),
    })
    .nullable(),
  quota: z.object({
    live: z.number().int(),
    liveCap: z.number().int(),
    submissionsLeft: z.number().int(),
    /** Lúc có thêm lượt gửi khi đã hết lượt trong giờ; còn lượt thì `null`. */
    nextSubmissionAt: iso.nullable(),
    /** Phí một lượt đăng tin (TK 29): hiện 0 Xu, app hiện "Miễn phí" — hợp đồng giữ nguyên ngày bật phí. */
    fee: z.object({ amount: z.number().int().min(0), currency: z.literal('xu') }),
  }),
  /** Đang trong thời gian chờ vì dò cổng cứng: mốc được gửi tin mới lại — không nêu cổng nào. */
  cooldownUntil: iso.nullable(),
  /** Gậy đang hiệu lực và lịch sử (add-strikes, spec seller-dashboard). */
  strikes: z.array(strikeSchema),
  strikePoints: z.number().int(),
  /** Đang tạm khoá đăng tin: ngày điểm gậy về dưới ngưỡng. */
  postingLockedUntil: iso.nullable(),
  restricted: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().nullable(),
      restrictions: z.array(z.enum(LISTING_RESTRICTIONS)),
    }),
  ),
  pending: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().nullable(),
      reason: z.string(),
      estimatedWait: z.string().nullable(),
      lookupCode: z.string().nullable(),
    }),
  ),
});

export type TrustDashboardDto = z.infer<typeof trustDashboardSchema>;
