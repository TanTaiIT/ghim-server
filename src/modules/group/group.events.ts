import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import type { GroupService } from './group.service.js';

const accountIdOf = (type: string, payload: Record<string, unknown>): string => {
  const { accountId } = payload;
  if (typeof accountId !== 'string') throw new Error(`${type} thiếu accountId`);
  return accountId;
};

/**
 * `group` nghe `identity` qua outbox (TK 30): khoá, mở khoá, xoá tài khoản là của `identity`; thiếu chủ, tạm khoá
 * nhóm, rời nhóm là của `group`. Chậm vài giây vẫn đúng — tài khoản bị khoá hay bị xoá đã mất mọi phiên ngay trong
 * lượt đó, nên không có thao tác nào trong nhóm lọt qua khoảng chờ.
 */
export function registerGroupListeners(dispatcher: OutboxDispatcher, group: GroupService): void {
  dispatcher.register('identity.account.locked', (payload) =>
    group.onAccountLocked(accountIdOf('identity.account.locked', payload)),
  );
  dispatcher.register('identity.account.unlocked', (payload) =>
    group.onAccountUnlocked(accountIdOf('identity.account.unlocked', payload)),
  );
  dispatcher.register('identity.account.deleted', (payload) =>
    group.onAccountDeleted(accountIdOf('identity.account.deleted', payload)),
  );
  // Gậy nặng (add-strikes): chủ nhóm mất vai → thiếu chủ; gậy hết hiệu lực → trả chủ. Bên nghe hỏi lại `trust`.
  dispatcher.register('trust.strike.issued', (payload) =>
    payload.kind === 'severe'
      ? group.onOwnerStruck(accountIdOf('trust.strike.issued', payload))
      : Promise.resolve(),
  );
  dispatcher.register('trust.strike.expired', (payload) =>
    group.onStrikeEnded(accountIdOf('trust.strike.expired', payload)),
  );
  dispatcher.register('trust.strike.cancelled', (payload) =>
    group.onStrikeEnded(accountIdOf('trust.strike.cancelled', payload)),
  );
  dispatcher.register('trust.strike.decided', (payload) =>
    group.onStrikeEnded(accountIdOf('trust.strike.decided', payload)),
  );
}
