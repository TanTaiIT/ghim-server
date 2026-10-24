import type { ScreeningCause, ScreeningOutcome } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  explain,
  type Explanation,
  renderExplanation,
} from '../src/modules/screening/calc/explanation.calc.js';
import type { AppliedHit } from '../src/modules/screening/calc/score.calc.js';
import { INITIAL_WEIGHTS, type RuleCode } from '../src/modules/screening/screening.rules.js';

/* Spec screening/explanations, phần thuần (design add-screening mục 8). */
const on = (code: RuleCode): AppliedHit => ({ code, weight: INITIAL_WEIGHTS[code], mode: 'on' });
const held = (
  codes: RuleCode[],
  cause: ScreeningCause = 'score',
  extra: { outcome?: ScreeningOutcome; recall?: boolean; hits?: AppliedHit[] } = {},
): Explanation | null =>
  explain({
    outcome: extra.outcome ?? 'hold',
    cause,
    hits: [...codes.map(on), ...(extra.hits ?? [])],
    recall: extra.recall ?? false,
  });
const render = (explanation: Explanation | null, code: string | null = null) => {
  if (!explanation) throw new Error('thiếu câu báo');
  return renderExplanation(explanation, code, 24);
};
const PLAIN = 'Tin đang chờ người duyệt, thường trong 24 giờ';

describe('Tin bị giữ không vì gian lận: câu chờ', () => {
  it('dải Cao từ giá bất thường, gõ bừa, liên hệ ngoài sàn: câu chờ, nêu hai lỗi tự sửa được', () => {
    const dto = render(held(['abnormal_price', 'gibberish', 'off_platform_contact']));
    expect(dto).toMatchObject({ kind: 'plain', message: PLAIN, lookupCode: null });
    expect(dto.fixes.map((fix) => fix.code)).toEqual(['abnormal_price', 'off_platform_contact']);
    expect(dto.fixes[0]?.message).toBe(
      'Giá của tin lệch xa mức thường thấy trong danh mục này. Kiểm tra lại đơn vị (đồng) và số 0.',
    );
  });

  it('chỉ vì danh mục luôn duyệt tay, vì lỗi của máy, vì quá 5 phút: câu chờ', () => {
    for (const cause of ['always_manual', 'error', 'timeout'] as const) {
      expect(render(held([], cause))).toMatchObject({ kind: 'plain', message: PLAIN, fixes: [] });
    }
  });

  it('T0 tài khoản mới + số Zalo: nhắc thêm số điện thoại vào hồ sơ', () => {
    const dto = render(held(['new_account', 'off_platform_contact']));
    expect(dto.kind).toBe('plain');
    expect(dto.fixes).toEqual([
      { code: 'off_platform_contact', message: expect.stringContaining('hồ sơ') },
    ]);
  });

  it('giá vượt trần, sai danh mục: câu cách sửa riêng', () => {
    expect(render(held(['price_over_cap'], 'gate')).fixes[0]?.message).toContain('mức tối đa');
    expect(render(held(['wrong_category'])).fixes[0]?.message).toContain('sai danh mục');
  });

  it('gõ bừa + tài khoản mới + giá 0 giá trị cao: chỉ câu chờ, không nêu dấu hiệu', () => {
    expect(render(held(['gibberish', 'new_account', 'zero_price_high_value']))).toEqual({
      kind: 'plain',
      message: PLAIN,
      estimatedWait: 'Thường trong 24 giờ',
      lookupCode: null,
      fixes: [],
    });
  });

  it('dấu hiệu gian lận đang chạy thử không biến câu chờ thành câu chung', () => {
    const trial: AppliedHit = { code: 'certain_phrase', weight: 0, mode: 'trial' };
    expect(held(['gibberish'], 'score', { hits: [trial] })?.kind).toBe('plain');
  });
});

describe('Dấu hiệu gian lận: câu chung ba phần', () => {
  const fraud = {
    kind: 'fraud',
    message: 'Tin cần kiểm tra an toàn thêm',
    estimatedWait: 'Thường trong 24 giờ',
  };

  it('chỉ cụm từ cấm mức chắc: câu chung, thời gian chờ, mã tra cứu', () => {
    expect(render(held(['certain_phrase'], 'gate'), 'S-ABCD')).toEqual({
      ...fraud,
      lookupCode: 'S-ABCD',
      fixes: [],
    });
  });

  it('cụm mơ hồ, ảnh trùng, trùng máy tài khoản khoá, đăng dồn, đánh dấu thiết bị, rút về: đều là câu chung', () => {
    expect(held(['ambiguous_phrase', 'gibberish', 'new_account'])?.kind).toBe('fraud');
    expect(held(['duplicate_image'], 'gate')?.kind).toBe('fraud');
    expect(held(['shared_device_locked', 'off_platform_contact'])?.kind).toBe('fraud');
    expect(held(['burst', 'new_account'])?.kind).toBe('fraud');
    expect(held([], 'device')?.kind).toBe('fraud');
    expect(held(['certain_phrase'], 'gate', { recall: true })?.kind).toBe('fraud');
  });

  it('không response nào nêu dấu hiệu, luật, cụm, ảnh hay thiết bị', () => {
    const cases = [
      held(['certain_phrase'], 'gate', {
        hits: [{ code: 'certain_phrase', weight: 0, mode: 'on', refs: ['phrase-1'] }],
      }),
      held(['burst', 'new_account']),
      held(['duplicate_image'], 'gate'),
      held([], 'device'),
    ];
    for (const explanation of cases) {
      const body = JSON.stringify(render(explanation, 'S-ABCD'));
      expect(body).not.toMatch(/burst|đăng dồn|lượt gửi|phrase|cụm|ảnh|image|thiết bị|device|máy/i);
    }
  });

  it('hai tín hiệu khác nhau: cùng một câu, chỉ khác mã tra cứu', () => {
    const phrase = render(held(['certain_phrase'], 'gate'), 'S-AAAA');
    const device = render(held([], 'device'), 'S-BBBB');
    expect({ ...phrase, lookupCode: null }).toEqual({ ...device, lookupCode: null });
    expect(phrase.lookupCode).not.toBe(device.lookupCode);
  });

  it('cụm từ cấm + giá bất thường: câu về giá cùng câu chung, không nêu cụm', () => {
    const dto = render(held(['certain_phrase', 'abnormal_price'], 'gate'), 'S-ABCD');
    expect(dto).toMatchObject({ ...fraud, lookupCode: 'S-ABCD' });
    expect(dto.fixes.map((fix) => fix.code)).toEqual(['abnormal_price']);
  });
});

describe('Hiện đầy đủ, hiện hạn chế', () => {
  it('hiện đầy đủ: không câu báo', () => {
    expect(held(['off_platform_contact'], 'score', { outcome: 'pass_full' })).toBeNull();
  });

  it('hạn chế có lỗi tự sửa được: chỉ nêu lỗi đó, kể cả khi có dấu hiệu gian lận', () => {
    const explanation = held(['burst', 'off_platform_contact'], 'score', {
      outcome: 'pass_limited',
    });
    expect(explanation).toEqual({ kind: 'limited', fixable: ['off_platform_contact'] });
    expect(render(explanation)).toMatchObject({
      kind: 'limited',
      lookupCode: null,
      estimatedWait: null,
    });
  });

  it('hạn chế không có lỗi tự sửa được: không câu báo', () => {
    expect(held(['new_account'], 'score', { outcome: 'pass_limited' })).toBeNull();
  });
});

describe('Câu giải thích lỗi ảnh (add-image-quality-checks)', () => {
  const IMAGES = ['anh-a', 'anh-b', 'anh-c'];
  const imageHit = (code: RuleCode, refs: string[], mode: 'on' | 'trial' = 'on'): AppliedHit => ({
    code,
    weight: 0,
    mode,
    refs,
  });
  const heldForImages = (hits: AppliedHit[]) =>
    explain({ outcome: 'hold', cause: 'image_quality', hits, recall: false, imageIds: IMAGES });

  it('câu theo vị trí ảnh, lỗi ảnh xếp theo ảnh đầu tiên trúng nó, sau lỗi chữ', () => {
    const explanation = heldForImages([
      imageHit('image_too_small', ['anh-b']),
      on('abnormal_price'),
      imageHit('image_blurry', ['anh-c', 'anh-a']),
    ]);
    expect(explanation).toEqual({
      kind: 'plain',
      fixable: ['abnormal_price', 'image_blurry', 'image_too_small'],
      images: { image_too_small: [2], image_blurry: [1, 3] },
    });
    expect(render(explanation).fixes.map((fix) => fix.message)).toEqual([
      'Giá của tin lệch xa mức thường thấy trong danh mục này. Kiểm tra lại đơn vị (đồng) và số 0.',
      'Ảnh 1, 3 bị mờ. Chụp lại, giữ yên máy và đủ sáng.',
      'Ảnh 2 quá nhỏ. Thay bằng ảnh chụp rõ hơn.',
    ]);
  });

  it('luật chất lượng chạy thử không sinh câu; câu lưu trước change này (không có vị trí) vẫn đọc được', () => {
    expect(heldForImages([imageHit('image_too_dark', ['anh-a'], 'trial')])).toEqual({
      kind: 'plain',
      fixable: [],
    });
    expect(
      render({ kind: 'plain', fixable: ['image_unreadable'] }).fixes.map((fix) => fix.message),
    ).toEqual(['Một ảnh không mở được. Xoá ảnh đó rồi tải ảnh khác.']);
  });
});
