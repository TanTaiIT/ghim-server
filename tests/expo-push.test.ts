import { describe, expect, it } from 'vitest';

import { createExpoPush, DEVICE_NOT_REGISTERED } from '../src/common/push/expo-push.js';

/* Cổng Expo Push qua HTTP thuần (design add-notifications mục 3): lô 100, header, ánh xạ ticket và biên nhận. */
const URL = 'https://exp.host/--/api/v2/push/send';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(respond: (call: Call) => unknown, status = 200) {
  const calls: Call[] = [];
  const call = async (url: string | URL | Request, init?: RequestInit) => {
    const record = {
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as unknown,
    };
    calls.push(record);
    return {
      ok: status < 400,
      status,
      json: async () => respond(record),
    } as Response;
  };
  return { calls, fetch: call as unknown as typeof fetch };
}

const message = (n: number) => ({
  to: `ExponentPushToken[t${n}]`,
  title: 'Tiêu đề',
  body: 'Nội dung',
  data: { notificationId: `n${n}` },
});

describe('send', () => {
  it('gửi JSON mảng tin kèm sound, header JSON và Bearer khi có token truy cập; ánh xạ ticket ok / lỗi theo thứ tự', async () => {
    const { calls, fetch } = fakeFetch(() => ({
      data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', message: 'Không đăng ký', details: { error: DEVICE_NOT_REGISTERED } },
      ],
    }));
    const push = createExpoPush({ url: URL, accessToken: 'bi-mat', fetch });
    const tickets = await push.send([message(1), message(2)]);
    expect(tickets).toEqual([
      { to: 'ExponentPushToken[t1]', status: 'ok', id: 'ticket-1' },
      { to: 'ExponentPushToken[t2]', status: 'error', error: DEVICE_NOT_REGISTERED },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer bi-mat',
    });
    expect(calls[0]?.body).toEqual([
      { ...message(1), sound: 'default' },
      { ...message(2), sound: 'default' },
    ]);
  });

  it('không có token truy cập thì không có header Authorization; hơn 100 tin chia lô', async () => {
    const { calls, fetch } = fakeFetch((call) => ({
      data: (call.body as unknown[]).map((_, index) => ({ status: 'ok', id: `t-${index}` })),
    }));
    const push = createExpoPush({ url: URL, accessToken: null, fetch });
    const tickets = await push.send(Array.from({ length: 250 }, (_, i) => message(i)));
    expect(tickets).toHaveLength(250);
    expect(calls.map((call) => (call.body as unknown[]).length)).toEqual([100, 100, 50]);
    expect(calls[0]?.headers).not.toHaveProperty('authorization');
  });

  it('Expo trả mã lỗi HTTP: ném, không lộ thân lỗi', async () => {
    const { fetch } = fakeFetch(() => ({ errors: ['ExponentPushToken[x] leaked'] }), 503);
    const push = createExpoPush({ url: URL, accessToken: null, fetch });
    await expect(push.send([message(1)])).rejects.toThrow('503');
  });
});

describe('receipts', () => {
  it('gọi …/getReceipts với mã ticket; ok và lỗi kèm mã lỗi', async () => {
    const { calls, fetch } = fakeFetch(() => ({
      data: {
        'ticket-1': { status: 'ok' },
        'ticket-2': {
          status: 'error',
          message: 'Gỡ app',
          details: { error: DEVICE_NOT_REGISTERED },
        },
      },
    }));
    const push = createExpoPush({ url: URL, accessToken: null, fetch });
    const receipts = await push.receipts(['ticket-1', 'ticket-2', 'ticket-3']);
    expect(calls[0]?.url).toBe('https://exp.host/--/api/v2/push/getReceipts');
    expect(calls[0]?.body).toEqual({ ids: ['ticket-1', 'ticket-2', 'ticket-3'] });
    expect(receipts.get('ticket-1')).toEqual({ status: 'ok' });
    expect(receipts.get('ticket-2')).toEqual({ status: 'error', error: DEVICE_NOT_REGISTERED });
    expect(receipts.has('ticket-3')).toBe(false);
  });
});
