import { describe, expect, it, vi } from 'vitest';

import type { OutboxDispatcher, OutboxHandler } from '../src/common/outbox/dispatcher.js';
import { registerListingListeners } from '../src/modules/listing/listing.events.js';
import {
  createInterimTrust,
  interimScreening,
  noOpenWork,
} from '../src/modules/listing/listing.ports.js';
import type { ListingService } from '../src/modules/listing/listing.service.js';

/* Chỗ cắm tạm của design add-listings mục 7, 8 (task 6.2): cổng tạm và máy duyệt tạm chỉ nối khi dev bật. */
function fakeDispatcher() {
  const handlers = new Map<string, OutboxHandler[]>();
  const dispatcher: OutboxDispatcher = {
    register: (type, handler) => handlers.set(type, [...(handlers.get(type) ?? []), handler]),
    runOnce: () => Promise.resolve({ published: 0, failed: 0 }),
    start: () => {},
    kick: () => {},
    stop: () => Promise.resolve(),
  };
  return { dispatcher, handlers };
}

function fakeListing() {
  const applyMachineOutcome = vi.fn(() => Promise.resolve(true));
  return { listing: { applyMachineOutcome } as unknown as ListingService, applyMachineOutcome };
}

const SUBMITTED = { listingId: 'tin-1', version: 3, ownerId: 'nguoi-1', deviceHash: 'x', at: '' };
const EVENT = { id: 'su-kien-1', type: 'listing.listing.submitted' };

describe('Cổng tạm', () => {
  it('mức tin cậy tạm: một mức cho mọi người, không chặn lượt gửi nào', async () => {
    const trust = createInterimTrust('T0');
    expect(await trust.tierOf('ai-cung-duoc')).toBe('T0');
    await expect(
      trust.assertCanSubmit({} as never, {
        accountId: 'a',
        kind: 'submit',
        placement: 'marketplace',
        groupId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('máy duyệt tạm không chặn, không chấm; không việc nào khoá nơi đăng', async () => {
    await expect(interimScreening.precheck('a')).resolves.toBeUndefined();
    expect(
      await interimScreening.scoreText({ listingId: 't', title: 'x', description: null }),
    ).toBeNull();
    expect(await noOpenWork.blocksPlacement('t')).toBe(false);
  });
});

describe('Máy duyệt tạm ở dev', () => {
  it('DEV_MACHINE_REVIEW=off: không nối bên nghe lượt gửi nào', () => {
    const { dispatcher, handlers } = fakeDispatcher();
    registerListingListeners(dispatcher, fakeListing().listing, { devMachineReview: 'off' });
    expect(handlers.has('listing.listing.submitted')).toBe(false);
  });

  it.each([
    ['pass_full', { outcome: 'pass', restrictMachine: false }],
    ['pass_limited', { outcome: 'pass', restrictMachine: true }],
    ['hold', { outcome: 'hold', restrictMachine: false }],
  ] as const)('%s: lượt gửi đi đúng đường kết quả máy thật', async (mode, expected) => {
    const { dispatcher, handlers } = fakeDispatcher();
    const { listing, applyMachineOutcome } = fakeListing();
    registerListingListeners(dispatcher, listing, { devMachineReview: mode });
    const [handler] = handlers.get('listing.listing.submitted') ?? [];
    await handler?.(SUBMITTED, EVENT);
    expect(applyMachineOutcome).toHaveBeenCalledWith({
      listingId: 'tin-1',
      listingVersion: 3,
      ...expected,
    });
  });

  it('payload sai: ném để sự kiện nằm lại outbox, không âm thầm bỏ qua', async () => {
    const { dispatcher, handlers } = fakeDispatcher();
    registerListingListeners(dispatcher, fakeListing().listing, { devMachineReview: 'pass_full' });
    const [handler] = handlers.get('listing.listing.submitted') ?? [];
    await expect(handler?.({ listingId: 'tin-1' }, EVENT)).rejects.toThrow('payload sai');
  });
});
