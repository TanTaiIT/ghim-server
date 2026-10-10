/**
 * Bỏ dấu (kể cả đ), hoa toàn bộ, gộp khoảng trắng — "quan  tri he thong" và "Quản trị hệ thống" là
 * một. Tên dành riêng so bằng nó, và `search_text` của khu vực cũng dựng bằng nó: cùng một hàm ở
 * lúc ghi và lúc tìm, nên "binh duong" khớp "Bình Dương" mà không cần extension nào của Postgres.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}
