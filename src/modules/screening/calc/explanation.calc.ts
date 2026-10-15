import type { ScreeningCause, ScreeningOutcome } from '@prisma/client';

import type { AppliedHit } from './score.calc.js';
import { FIXABLE_CODES, FRAUD_CODES, type RuleCode } from '../screening.rules.js';

/**
 * Câu báo của một lượt, lưu trong `screening_runs.explanation` (design mục 8). `fraud` = câu chung ba phần kèm mã tra
 * cứu; `plain` = "Tin đang chờ người duyệt"; `limited` = tin hiện hạn chế, chỉ nêu lỗi tự sửa được. Không trường nào
 * chứa mã luật gian lận, cụm, ảnh hay thiết bị.
 */
export type Explanation = {
  kind: 'plain' | 'fraud' | 'limited';
  fixable: RuleCode[];
};

export function explain(input: {
  outcome: ScreeningOutcome;
  cause: ScreeningCause;
  hits: readonly AppliedHit[];
  recall: boolean;
}): Explanation | null {
  if (input.outcome === 'pass_full') return null;
  const live = input.hits.filter((hit) => hit.mode === 'on').map((hit) => hit.code);
  const fixable = [...new Set(live.filter((code) => FIXABLE_CODES.has(code)))];
  if (input.outcome === 'pass_limited') {
    return fixable.length > 0 ? { kind: 'limited', fixable } : null;
  }
  const fraud =
    input.recall || input.cause === 'device' || live.some((code) => FRAUD_CODES.has(code));
  return { kind: fraud ? 'fraud' : 'plain', fixable };
}

export interface ExplanationDto {
  kind: Explanation['kind'];
  message: string;
  estimatedWait: string | null;
  /** Mã đưa cho hỗ trợ — chỉ ở câu chung ba phần. */
  lookupCode: string | null;
  fixes: { code: string; message: string }[];
}

/** Câu cho từng lỗi tự sửa được, kèm việc làm được ngay (spec explanations). */
const FIX_MESSAGES: Partial<Record<RuleCode, string>> = {
  abnormal_price:
    'Giá của tin lệch xa mức thường thấy trong danh mục này. Kiểm tra lại đơn vị (đồng) và số 0.',
  price_over_cap: 'Giá cao hơn mức tối đa của danh mục này. Kiểm tra lại giá.',
  wrong_category: 'Tin có thể đang sai danh mục. Kiểm tra lại danh mục đã chọn.',
  off_platform_contact:
    'Thêm số điện thoại vào hồ sơ thay vì ghi trong mô tả — người mua vẫn gọi được, tin không bị giữ vì điều này.',
};

export function renderExplanation(
  explanation: Explanation,
  lookupCode: string | null,
  holdHours: number,
): ExplanationDto {
  const wait = `Thường trong ${holdHours} giờ`;
  const fixes = explanation.fixable.flatMap((code) => {
    const message = FIX_MESSAGES[code];
    return message ? [{ code, message }] : [];
  });
  switch (explanation.kind) {
    case 'fraud':
      return {
        kind: 'fraud',
        message: 'Tin cần kiểm tra an toàn thêm',
        estimatedWait: wait,
        lookupCode,
        fixes,
      };
    case 'plain':
      return {
        kind: 'plain',
        message: `Tin đang chờ người duyệt, thường trong ${holdHours} giờ`,
        estimatedWait: wait,
        lookupCode: null,
        fixes,
      };
    default:
      return {
        kind: 'limited',
        message: 'Tin đang hiện hạn chế',
        estimatedWait: null,
        lookupCode: null,
        fixes,
      };
  }
}
