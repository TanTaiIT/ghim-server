import { fold } from '../../common/text/fold.js';

export type PhraseLevel = 'certain' | 'ambiguous';
export type RuleMode = 'on' | 'trial' | 'off';

export interface PhraseEntry {
  id: string;
  /** Chữ gốc master gõ — `fold` lại ở đây, nên bộ so khớp không phụ thuộc cách cột `folded` được ghi. */
  text: string;
  level: PhraseLevel;
  mode: RuleMode;
  exceptions: readonly string[];
}

export interface PhraseHit {
  phraseId: string;
  level: PhraseLevel;
  mode: Exclude<RuleMode, 'off'>;
}

/** Ghép chữ cái tách rời khi có từ ngần này chữ một ký tự liền nhau — "b á n s ú n g" (design add-screening mục 7). */
const SPELLED_RUN = 3;

interface Token {
  text: string;
  /** Khối ghép từ chữ cái tách rời: so cụm đã bỏ khoảng trắng ở bất kỳ đâu bên trong. */
  spelled: boolean;
}

/** Chỗ trúng: theo dãy chữ (`from`..`to` là chỉ số chữ), hay bên trong một khối (`from`..`to` là chỉ số ký tự). */
type Span =
  | { kind: 'words'; from: number; to: number }
  | { kind: 'spelled'; token: number; from: number; to: number };

const splitWords = (text: string): string[] =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Chữ của cụm sau khi `fold` — cũng là thứ quyết "từ hai chữ trở lên" (spec banned-phrases). */
export const phraseWords = splitWords;

/** Tách chữ đã `fold`, rồi ghép các dãy chữ một ký tự thành một khối. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= SPELLED_RUN) tokens.push({ text: run.join(''), spelled: true });
    else tokens.push(...run.map((word) => ({ text: word, spelled: false })));
    run = [];
  };
  for (const word of splitWords(text)) {
    if (word.length === 1) {
      run.push(word);
    } else {
      flush();
      tokens.push({ text: word, spelled: false });
    }
  }
  flush();
  return tokens;
}

/**
 * Mọi chỗ trúng của một cụm. Ngoài khối chữ tách rời thì so theo dãy chữ nguyên — "can sa" không khớp "can sang";
 * trong khối thì tìm cụm đã bỏ khoảng trắng.
 */
function occurrences(tokens: readonly Token[], words: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    if (words.every((word, offset) => tokens[i + offset]?.text === word)) {
      spans.push({ kind: 'words', from: i, to: i + words.length });
    }
  }
  const joined = words.join('');
  tokens.forEach((token, index) => {
    if (!token.spelled) return;
    for (let at = token.text.indexOf(joined); at >= 0; at = token.text.indexOf(joined, at + 1)) {
      spans.push({ kind: 'spelled', token: index, from: at, to: at + joined.length });
    }
  });
  return spans;
}

/** Chỗ trúng nằm trọn trong một chỗ trúng của ngoại lệ, cùng loại chỗ. */
function covered(hit: Span, by: Span): boolean {
  if (hit.kind === 'words' && by.kind === 'words') return by.from <= hit.from && hit.to <= by.to;
  if (hit.kind === 'spelled' && by.kind === 'spelled') {
    return hit.token === by.token && by.from <= hit.from && hit.to <= by.to;
  }
  return false;
}

/**
 * Bộ so khớp dựng một lần cho mỗi phiên bản cụm từ (design mục 7) — dùng chung cho tin và tên hiển thị. Cụm tắt không có
 * mặt; cụm chạy thử vẫn trúng, người gọi quyết nó không đổi kết quả.
 */
export function buildPhraseMatcher(entries: readonly PhraseEntry[]) {
  const phrases = entries
    .filter((entry) => entry.mode !== 'off')
    .map((entry) => ({
      entry,
      words: splitWords(entry.text),
      exceptions: entry.exceptions.map(splitWords).filter((words) => words.length > 0),
    }))
    .filter((phrase) => phrase.words.length >= 2);

  return {
    match(text: string): PhraseHit[] {
      const tokens = tokenize(text);
      return phrases.flatMap(({ entry, words, exceptions }) => {
        const excepted = exceptions.flatMap((exception) => occurrences(tokens, exception));
        const live = occurrences(tokens, words).filter(
          (hit) => !excepted.some((by) => covered(hit, by)),
        );
        if (live.length === 0 || entry.mode === 'off') return [];
        return [{ phraseId: entry.id, level: entry.level, mode: entry.mode }];
      });
    },
  };
}

export type PhraseMatcher = ReturnType<typeof buildPhraseMatcher>;
