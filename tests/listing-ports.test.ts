import { describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';

/* Chỗ cắm tạm của design add-listings mục 7, 8: test không bàn về mức tin cậy hay máy duyệt đè cổng bằng các bản này. */
describe('Cổng tạm', () => {
  it('mức tin cậy tạm: một mức cho mọi người, không chặn lượt gửi nào', async () => {
    const trust = createInterimTrust('T0');
    expect(await trust.tierOf('ai-cung-duoc')).toBe('T0');
    await expect(
      trust.assertCanSubmit({} as never, {
        accountId: 'a',
        listingId: 't',
        kind: 'submit',
        fromState: 'draft',
        outsiderGroupId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('máy duyệt tạm không chặn, không chấm', async () => {
    await expect(interimScreening.precheck('a', 'submit')).resolves.toBeUndefined();
    expect(
      await interimScreening.scoreText({
        listingId: 't',
        accountId: 'a',
        kind: 'submit',
        deviceHash: 'd',
        title: 'x',
        description: null,
        price: 0n,
        categoryId: 'c',
        placement: 'marketplace',
        imageIds: [],
        groupManual: false,
      }),
    ).toBeNull();
  });
});
