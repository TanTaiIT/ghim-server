import { describe, expect, it } from 'vitest';

import {
  buildPhraseMatcher,
  type PhraseEntry,
  phraseWords,
  tokenize,
} from '../src/modules/screening/phrase.calc.js';

/* Spec screening/banned-phrases và delta identity/profile, phần so khớp thuần (design add-screening mục 7). */
const phrase = (overrides: Partial<PhraseEntry> = {}): PhraseEntry => ({
  id: 'ban-sung',
  text: 'bán súng',
  level: 'certain',
  mode: 'on',
  exceptions: [],
  ...overrides,
});
const ids = (entries: PhraseEntry[], text: string) =>
  buildPhraseMatcher(entries)
    .match(text)
    .map((hit) => hit.phraseId);

describe('So khớp theo ranh giới chữ, không phân biệt dấu', () => {
  it('trúng cụm mức chắc trong tiêu đề "Bán súng hơi"', () => {
    expect(buildPhraseMatcher([phrase()]).match('Bán súng hơi')).toEqual([
      { phraseId: 'ban-sung', level: 'certain', mode: 'on' },
    ]);
  });

  it('viết không dấu "ban sung gia re": trúng', () => {
    expect(ids([phrase()], 'ban sung gia re')).toEqual(['ban-sung']);
  });

  it('chữ cái tách rời "b á n s ú n g": trúng; tách một phần "b a n súng": trúng', () => {
    expect(ids([phrase()], 'b á n s ú n g')).toEqual(['ban-sung']);
    expect(ids([phrase()], 'Cần b a n súng gấp')).toEqual(['ban-sung']);
  });

  it('chỉ khớp một phần chữ "cần sang nhượng gấp": không trúng "cần sa"', () => {
    expect(ids([phrase({ id: 'can-sa', text: 'cần sa' })], 'cần sang nhượng gấp')).toEqual([]);
  });

  it('chữ hoa, dấu câu chen giữa vẫn là ranh giới chữ', () => {
    expect(ids([phrase()], 'BÁN, SÚNG!!!')).toEqual(['ban-sung']);
  });
});

describe('Ngoại lệ của từng cụm', () => {
  const withException = phrase({ exceptions: ['bán súng nước'] });

  it('chỉ có ngoại lệ "bán súng nước cho bé": không trúng', () => {
    expect(ids([withException], 'bán súng nước cho bé')).toEqual([]);
  });

  it('có cả ngoại lệ lẫn cụm "bán súng nước, bán súng hơi": trúng', () => {
    expect(ids([withException], 'bán súng nước, bán súng hơi')).toEqual(['ban-sung']);
  });

  it('ngoại lệ cũng áp trong chữ cái tách rời', () => {
    expect(ids([withException], 'b a n s u n g n u o c')).toEqual([]);
  });
});

describe('Chế độ và độ dài cụm', () => {
  it('cụm chạy thử vẫn trúng, mang chế độ chạy thử; cụm tắt không trúng', () => {
    expect(buildPhraseMatcher([phrase({ mode: 'trial' })]).match('Bán súng hơi')).toEqual([
      { phraseId: 'ban-sung', level: 'certain', mode: 'trial' },
    ]);
    expect(ids([phrase({ mode: 'off' })], 'Bán súng hơi')).toEqual([]);
  });

  it('từ đơn không bao giờ thành cụm: "súng" không chặn "bổ sung", "quả sung"', () => {
    expect(phraseWords('súng')).toHaveLength(1);
    expect(ids([phrase({ id: 'sung', text: 'súng' })], 'bổ sung vitamin, quả sung')).toEqual([]);
  });

  it('nhiều cụm cùng trúng: mỗi cụm một lần dù xuất hiện nhiều chỗ', () => {
    const entries = [phrase(), phrase({ id: 'dan-that', text: 'đạn thật', level: 'ambiguous' })];
    expect(ids(entries, 'bán súng, bán súng, có đạn thật')).toEqual(['ban-sung', 'dan-that']);
  });

  it('tách chữ: dãy ngắn hơn ba chữ một ký tự không bị ghép', () => {
    expect(tokenize('a b ban').map((token) => token.text)).toEqual(['A', 'B', 'BAN']);
    expect(tokenize('b a n').map((token) => token.text)).toEqual(['BAN']);
  });
});

describe('Tên hiển thị dùng cùng bộ so khớp (delta identity/profile)', () => {
  it('"Bán Súng Giá Rẻ" và "b á n s ú n g" trúng cụm mức chắc; tên bình thường thì không', () => {
    expect(ids([phrase()], 'Bán Súng Giá Rẻ')).toEqual(['ban-sung']);
    expect(ids([phrase()], 'b á n s ú n g')).toEqual(['ban-sung']);
    expect(ids([phrase()], 'Nguyễn Văn Bình')).toEqual([]);
  });
});
