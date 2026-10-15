import { describe, expect, it } from 'vitest';

import {
  applyRules,
  bandOf,
  type RawHit,
  type RuleBook,
  scoreOf,
} from '../src/modules/screening/calc/score.calc.js';
import type { RuleCode } from '../src/modules/screening/screening.rules.js';
import { initialBook } from './screening-book.js';

/* Spec screening/risk-scoring (điểm, dải) và screening/rule-management, phần thuần. */
const scoreFor = (codes: RuleCode[], book: RuleBook = initialBook(), categoryId = 'clothes') =>
  scoreOf(
    applyRules(
      codes.map((code) => ({ code })),
      book,
      categoryId,
    ),
  );

describe('Điểm là tổng trọng số các dấu hiệu trúng', () => {
  it('không trúng dấu hiệu nào: 0', () => {
    expect(scoreFor([])).toBe(0);
  });

  it('giá bất thường 25 + gõ bừa 30 + liên hệ ngoài sàn 20 = 75', () => {
    expect(scoreFor(['abnormal_price', 'gibberish', 'off_platform_contact'])).toBe(75);
  });

  it('cổng cứng không cộng điểm', () => {
    expect(scoreFor(['certain_phrase', 'price_over_cap', 'off_platform_contact'])).toBe(20);
  });

  it('nhiều cụm mơ hồ cộng một lần, kết quả vẫn ghi mọi cụm', () => {
    const raw: RawHit[] = [
      { code: 'ambiguous_phrase', refs: ['p1'] },
      { code: 'ambiguous_phrase', refs: ['p2'] },
    ];
    const hits = applyRules(raw, initialBook(), null);
    expect(hits).toEqual([
      { code: 'ambiguous_phrase', weight: 25, mode: 'on', refs: ['p1', 'p2'] },
    ]);
    expect(scoreOf(hits)).toBe(25);
  });

  it('một cụm mơ hồ bật, một cụm đang chạy thử: cộng một lần, cụm chạy thử ghi riêng', () => {
    const hits = applyRules(
      [
        { code: 'ambiguous_phrase', refs: ['p1'] },
        { code: 'ambiguous_phrase', trial: true, refs: ['p2'] },
      ],
      initialBook(),
      null,
    );
    expect(hits).toEqual([
      { code: 'ambiguous_phrase', weight: 25, mode: 'on', refs: ['p1'] },
      { code: 'ambiguous_phrase', weight: 25, mode: 'trial', refs: ['p2'] },
    ]);
    expect(scoreOf(hits)).toBe(25);
  });
});

describe('Ba dải rủi ro', () => {
  it('29, 30, 59, 60 → Thấp, Vừa, Vừa, Cao', () => {
    const book = initialBook();
    expect([29, 30, 59, 60].map((score) => bandOf(score, book, 'clothes'))).toEqual([
      'low',
      'medium',
      'medium',
      'high',
    ]);
  });

  it('Điện thoại có ngưỡng Vừa từ 20: điểm 25 ở dải Vừa, danh mục dùng ngưỡng chung vẫn Thấp', () => {
    const book = initialBook({}, { bands: { phones: { mediumFrom: 20, highFrom: 60 } } });
    expect(bandOf(25, book, 'phones')).toBe('medium');
    expect(bandOf(25, book, 'clothes')).toBe('low');
  });
});

describe('Trọng số và chế độ theo phiên bản luật', () => {
  it('master hạ "liên hệ ngoài sàn" xuống 10: tin chỉ trúng luật này có điểm 10', () => {
    expect(
      scoreFor(['off_platform_contact'], initialBook({ off_platform_contact: { weight: 10 } })),
    ).toBe(10);
  });

  it('"bị giữ nhiều" chạy thử: điểm chỉ từ luật khác, lượt trúng ghi ở chế độ chạy thử', () => {
    const book = initialBook({ held_many: { mode: 'trial' } });
    const hits = applyRules([{ code: 'held_many' }, { code: 'own_duplicate' }], book, null);
    expect(scoreOf(hits)).toBe(20);
    expect(hits).toContainEqual({ code: 'held_many', weight: 15, mode: 'trial' });
  });

  it('"tài khoản mới" tắt: không trúng, kết quả không ghi luật này', () => {
    const hits = applyRules(
      [{ code: 'new_account' }],
      initialBook({ new_account: { mode: 'off' } }),
      null,
    );
    expect(hits).toEqual([]);
  });

  it('"liên hệ ngoài sàn" 30 riêng cho Điện thoại: Điện thoại 30, Quần áo 20', () => {
    const book = initialBook(
      {},
      { overrides: { phones: { off_platform_contact: { weight: 30 } } } },
    );
    expect(scoreFor(['off_platform_contact'], book, 'phones')).toBe(30);
    expect(scoreFor(['off_platform_contact'], book, 'clothes')).toBe(20);
  });

  it('tắt "giá bất thường" riêng cho Đồ cổ: danh mục khác vẫn xét', () => {
    const book = initialBook({}, { overrides: { antiques: { abnormal_price: { mode: 'off' } } } });
    expect(applyRules([{ code: 'abnormal_price' }], book, 'antiques')).toEqual([]);
    expect(scoreFor(['abnormal_price'], book, 'clothes')).toBe(25);
  });

  it('luật có trong mã mà chưa có dòng: ghi ở chế độ chạy thử, không đổi điểm', () => {
    const book = initialBook();
    const rules = new Map(book.rules);
    rules.delete('burst');
    const hits = applyRules([{ code: 'burst' }], { ...book, rules }, null);
    expect(hits).toEqual([{ code: 'burst', weight: 0, mode: 'trial' }]);
    expect(scoreOf(hits)).toBe(0);
  });
});
