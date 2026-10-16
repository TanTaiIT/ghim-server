/*
 * Mã xác nhận email cho lượt chạy khói (`smoke-posting.ts`), đọc từ hộp thư giả của môi trường dev: mailpit
 * (`pnpm mail:up`) hay tệp thư của stub SMTP trên máy không có Docker. Hàm thuần — `tests/smoke-mail.test.ts`.
 */

const SUBJECT = /(\d{6}) là mã xác nhận email/;

/** Mã trong tiêu đề thư xác nhận ("123456 là mã xác nhận email Ghim của bạn"); thư khác thì `null`. */
export function codeFromSubject(subject: string): string | null {
  return SUBJECT.exec(subject)?.[1] ?? null;
}

/**
 * Mã của thư MỚI NHẤT gửi tới `to` trong tệp thư của stub SMTP: mỗi thư mở đầu bằng `[smtp giả]`, có dòng
 * `Tới: <địa chỉ>` và dòng `Tiêu đề: …`.
 */
export function codeFromMailLog(log: string, to: string): string | null {
  const mails = log
    .replace(/\r/g, '')
    .split('[smtp giả]')
    .filter((mail) => mail.split('\n').some((line) => line.trim() === `Tới: ${to}`));
  const last = mails.at(-1);
  return last === undefined ? null : codeFromSubject(last);
}

/** Mã của thư mới nhất trong kết quả `GET /api/v1/search` của mailpit (mới nhất đứng đầu). */
export function codeFromMailpit(body: unknown): string | null {
  const messages = (body as { messages?: { Subject?: unknown }[] } | null)?.messages ?? [];
  for (const message of messages) {
    const code = typeof message.Subject === 'string' ? codeFromSubject(message.Subject) : null;
    if (code) return code;
  }
  return null;
}
