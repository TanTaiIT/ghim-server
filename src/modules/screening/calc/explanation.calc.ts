import type { ScreeningCause, ScreeningOutcome } from '@prisma/client';

import type { AppliedHit } from './score.calc.js';
import {
  FIXABLE_CODES,
  FRAUD_CODES,
  isQuality,
  type QualityCode,
  type RuleCode,
} from '../screening.rules.js';

/**
 * Câu báo của một lượt, lưu trong `screening_runs.explanation` (design mục 8). `fraud` = câu chung ba phần kèm mã tra
 * cứu; `plain` = "Tin đang chờ người duyệt"; `limited` = tin hiện hạn chế, chỉ nêu lỗi tự sửa được. Không trường nào
 * chứa mã luật gian lận, cụm, ảnh hay thiết bị.
 */
export type Explanation = {
  kind: 'plain' | 'fraud' | 'limited';
  fixable: RuleCode[];
  /** Vị trí (từ 1) các ảnh trúng mỗi lỗi ảnh; không có ở câu lưu trước add-image-quality-checks. */
  images?: Partial<Record<QualityCode, number[]>>;
};

export function explain(input: {
  outcome: ScreeningOutcome;
  cause: ScreeningCause;
  hits: readonly AppliedHit[];
  recall: boolean;
  /** Ảnh của lượt theo thứ tự trong tin; lượt rút về không có lỗi ảnh nào nên bỏ trống. */
  imageIds?: readonly string[];
}): Explanation | null {
  if (input.outcome === 'pass_full') return null;
  const liveHits = input.hits.filter((hit) => hit.mode === 'on');
  const live = liveHits.map((hit) => hit.code);
  const images = imagePositions(liveHits, input.imageIds ?? []);
  // Lỗi chữ giữ thứ tự trúng; lỗi ảnh theo ảnh đầu tiên trúng nó — "Ảnh 1 …" đứng trước "Ảnh 2 …".
  const firstImage = (code: RuleCode) => (isQuality(code) ? (images?.[code]?.[0] ?? 0) : 0);
  const fixable = [...new Set(live.filter((code) => FIXABLE_CODES.has(code)))].toSorted(
    (a, b) => firstImage(a) - firstImage(b),
  );
  const withImages = images ? { fixable, images } : { fixable };
  if (input.outcome === 'pass_limited') {
    return fixable.length > 0 ? { kind: 'limited', ...withImages } : null;
  }
  const fraud =
    input.recall || input.cause === 'device' || live.some((code) => FRAUD_CODES.has(code));
  return { kind: fraud ? 'fraud' : 'plain', ...withImages };
}

function imagePositions(
  hits: readonly AppliedHit[],
  imageIds: readonly string[],
): Explanation['images'] {
  const images: Partial<Record<QualityCode, number[]>> = {};
  for (const hit of hits) {
    if (!isQuality(hit.code)) continue;
    const positions = (hit.refs ?? [])
      .map((id) => imageIds.indexOf(id) + 1)
      .filter((position) => position > 0)
      .toSorted((a, b) => a - b);
    if (positions.length > 0) images[hit.code] = positions;
  }
  return Object.keys(images).length > 0 ? images : undefined;
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

/** Câu cho lỗi ảnh, `which` = "Ảnh 2" hay "Ảnh 1, 3" (spec explanations: câu về ảnh nói ảnh thứ mấy). */
const IMAGE_FIX_MESSAGES: Readonly<Record<QualityCode, (which: string) => string>> = {
  image_unreadable: (which) => `${which} không mở được. Xoá ảnh đó rồi tải ảnh khác.`,
  image_too_small: (which) => `${which} quá nhỏ. Thay bằng ảnh chụp rõ hơn.`,
  image_blurry: (which) => `${which} bị mờ. Chụp lại, giữ yên máy và đủ sáng.`,
  image_too_dark: (which) => `${which} quá tối. Chụp lại ở nơi đủ sáng.`,
  image_too_bright: (which) =>
    `${which} quá sáng, gần như trắng xoá. Chụp lại, tránh đèn chiếu thẳng vào máy.`,
};

/** Câu sửa một lỗi ảnh — cũng là câu từ chối ảnh tin nhắn (add-message-images). */
export const imageFixMessage = (code: QualityCode, which: string): string =>
  IMAGE_FIX_MESSAGES[code](which);

const fixMessage = (explanation: Explanation, code: RuleCode): string | undefined => {
  if (!isQuality(code)) return FIX_MESSAGES[code];
  const positions = explanation.images?.[code];
  return imageFixMessage(code, positions ? `Ảnh ${positions.join(', ')}` : 'Một ảnh');
};

export function renderExplanation(
  explanation: Explanation,
  lookupCode: string | null,
  holdHours: number,
): ExplanationDto {
  const wait = `Thường trong ${holdHours} giờ`;
  const fixes = explanation.fixable.flatMap((code) => {
    const message = fixMessage(explanation, code);
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
