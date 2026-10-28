import type { IdentityService } from '../identity/identity.service.js';
import type { WalletRepository } from './wallet.repository.js';

/*
 * Điều `wallet` hỏi ở module khác và cửa `wallet` mở cho module khác (design add-wallet mục 1, 5) — chỉ qua cổng.
 */

/** `identity` trả lời "tài khoản này là ai" (TK 30): có thật không, đã xoá chưa. */
export type WalletIdentityPort = Pick<IdentityService, 'accountState'>;

/**
 * Cửa ghi cho gói đẩy tin (`add-promotions`): trừ Xu và áp hiệu ứng trong cùng một transaction — chỗ gọi đồng bộ thứ
 * năm của TK 30. Lỗi của `apply` phải làm hỏng cả transaction của bên gọi, không được nuốt.
 */
export type WalletLedgerPort = Pick<WalletRepository, 'apply' | 'findByKey'>;
