/** Phí của một lượt đăng tin (TK 29 — hoãn, hiện bằng 0, app hiện "Miễn phí"): một chỗ duy nhất, ngày bật đổi hàm này. */
export interface PostingFee {
  amount: number;
  currency: 'xu';
}

export const postingFee = (): PostingFee => ({ amount: 0, currency: 'xu' });
