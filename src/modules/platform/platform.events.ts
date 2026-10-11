import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import type { PlatformService } from './platform.service.js';

/**
 * `platform` nghe `identity` qua outbox thay vì `identity` gọi thẳng `platform` (CLAUDE.md luật 12):
 * khoá và xoá tài khoản là của `identity`, treo và thu quyền là của `platform`, và hai việc đó không
 * cần chung một transaction — chậm vài giây vẫn đúng, vì phiên của tài khoản bị khoá hay bị xoá đã bị
 * thu hồi ngay trong lượt đó nên không có lượt gọi bàn vận hành nào lọt qua trong khoảng đó.
 */
export function registerPlatformListeners(
  dispatcher: OutboxDispatcher,
  platform: PlatformService,
): void {
  dispatcher.register('identity.account.locked', async (payload) => {
    const { accountId } = payload;
    if (typeof accountId !== 'string') throw new Error('identity.account.locked thiếu accountId');
    await platform.suspendStaffForLock(accountId);
  });
  dispatcher.register('identity.account.deleted', async (payload) => {
    const { accountId } = payload;
    if (typeof accountId !== 'string') throw new Error('identity.account.deleted thiếu accountId');
    await platform.revokeStaffForDeletion(accountId);
  });
}
