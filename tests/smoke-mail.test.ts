import { describe, expect, it } from 'vitest';

import { codeFromMailLog, codeFromMailpit, codeFromSubject } from '../src/cli/smoke-mail.js';

/* Đọc mã xác nhận email cho `pnpm smoke:posting` từ mailpit hay tệp thư của stub SMTP. */
const mail = (to: string, code: string) =>
  `\n[smtp giả] ── thư mới ─────────────────\n  Tới: ${to}\n  Tiêu đề: ${code} là mã xác nhận email Ghim của bạn\n\nNhập mã sau vào app Ghim để xác nhận email: ${code}\n`;

describe('mã xác nhận cho lượt chạy khói', () => {
  it('tiêu đề thư xác nhận ra mã; tiêu đề khác ra null', () => {
    expect(codeFromSubject('482913 là mã xác nhận email Ghim của bạn')).toBe('482913');
    expect(codeFromSubject('Mật khẩu của bạn vừa được đổi')).toBeNull();
  });

  it('tệp thư của stub: lấy thư mới nhất của đúng người nhận, kể cả xuống dòng kiểu Windows', () => {
    const log = [
      mail('a@example.com', '111111'),
      mail('ab@example.com', '222222'),
      mail('a@example.com', '333333'),
    ]
      .join('')
      .replace(/\n/g, '\r\n');
    expect(codeFromMailLog(log, 'a@example.com')).toBe('333333');
    expect(codeFromMailLog(log, 'ab@example.com')).toBe('222222');
    expect(codeFromMailLog(log, 'khac@example.com')).toBeNull();
  });

  it('mailpit: thư mới nhất đứng đầu; bỏ qua thư không phải thư xác nhận', () => {
    expect(
      codeFromMailpit({
        messages: [
          { Subject: 'Chào mừng bạn' },
          { Subject: '654321 là mã xác nhận email Ghim của bạn' },
          { Subject: '123456 là mã xác nhận email Ghim của bạn' },
        ],
      }),
    ).toBe('654321');
    expect(codeFromMailpit({ messages: [] })).toBeNull();
    expect(codeFromMailpit(null)).toBeNull();
  });
});
