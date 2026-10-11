import type { FastifyInstance } from 'fastify';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REALTIME_PATH } from '../src/common/realtime/realtime.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/* Spec `notification/realtime` trên server thật đang lắng nghe và client socket.io thật. */
let app: FastifyInstance;
let baseUrl: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await buildTestApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Không lấy được cổng');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await app.close();
});

/** Nối và chờ tới khi bắt tay xong hay bị từ chối — không tự nối lại để test thấy đúng một kết cục. */
function connect(token: string): Promise<Socket> {
  const socket = io(baseUrl, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

const next = <T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Không nhận được ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const disconnected = (socket: Socket, timeoutMs = 3000): Promise<void> =>
  socket.disconnected ? Promise.resolve() : next(socket, 'disconnect', timeoutMs);

/** Một phiên nữa của cùng người — "máy thứ hai". */
const secondDevice = (user: TestUser) => tokenFor(app, user.id);

const deliver = () => deliverAll(app);

describe('kết nối realtime bằng phiên đăng nhập', () => {
  it('token hợp lệ → kết nối được chấp nhận', async () => {
    const user = await newUser(app);
    const socket = await connect(user.token);
    expect(socket.connected).toBe(true);
  });

  it('token sai → bị từ chối', async () => {
    await expect(connect('khong-phai-token')).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('phiên đã đăng xuất → bị từ chối', async () => {
    const user = await newUser(app);
    const { sid } = app.jwt.decode<{ sid: string }>(user.token) ?? { sid: '' };
    await repositories.identity.updateSession(sid, {
      revokedAt: new Date(),
      revokeReason: 'logout',
    });
    await expect(connect(user.token)).rejects.toThrow(/UNAUTHORIZED/);
  });
});

describe('chỉ nhận chuyện của chính mình', () => {
  it('đơn được duyệt: cả hai máy của người xin nhận thông báo có nhắc; người khác không nhận gì', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const applicant = await newUser(app);
    const phone = await connect(applicant.token);
    const tablet = await connect(await secondDevice(applicant));
    const bystander = await connect((await newUser(app)).token);
    let leaked = false;
    bystander.on('notification:new', () => {
      leaked = true;
    });

    const joined = await api(app, 'POST', `/groups/${group.groupId}/join`, applicant.token, {});
    const requestId = joined.json().data.request.id as string;
    await api(app, 'POST', `/group-join-requests/${requestId}/decision`, group.owner.token, {
      approve: true,
    });
    const onPhone = next<{ notification: { type: string }; alert: boolean }>(
      phone,
      'notification:new',
    );
    const onTablet = next<{ notification: { type: string }; alert: boolean }>(
      tablet,
      'notification:new',
    );
    await deliver();
    expect(await onPhone).toMatchObject({
      notification: { type: 'group.join_request.approved' },
      alert: true,
    });
    expect(await onTablet).toMatchObject({
      notification: { type: 'group.join_request.approved' },
      alert: true,
    });
    expect(leaked).toBe(false);
  });
});

describe('kết nối bị cắt khi mất quyền', () => {
  it('tài khoản bị khoá → mọi kết nối bị cắt', async () => {
    const master = await newMaster(app);
    const user = await newUser(app);
    const first = await connect(user.token);
    const second = await connect(await secondDevice(user));
    const res = await api(app, 'POST', `/ops/accounts/${user.id}/lock`, master.token, {
      reason: 'Thử',
    });
    expect(res.statusCode, res.body).toBe(204);
    await Promise.all([disconnected(first), disconnected(second)]);
  });

  it('thu hồi phiên máy thứ hai → chỉ kết nối của máy đó bị cắt', async () => {
    const user = await newUser(app);
    const phone = await connect(user.token);
    const tabletToken = await secondDevice(user);
    const tablet = await connect(tabletToken);
    const { sid } = app.jwt.decode<{ sid: string }>(tabletToken) ?? { sid: '' };
    const res = await api(app, 'DELETE', `/me/sessions/${sid}`, user.token);
    expect(res.statusCode, res.body).toBe(204);
    await disconnected(tablet);
    expect(phone.connected).toBe(true);
  });

  it('access token hết hạn → kết nối bị cắt', async () => {
    const user = await newUser(app);
    const { sid } = app.jwt.decode<{ sid: string }>(user.token) ?? { sid: '' };
    const shortLived = app.jwt.sign({ sid }, { expiresIn: 1 });
    const socket = await connect(shortLived);
    await disconnected(socket, 3000);
  });
});

describe('báo hiệu để app tải lại', () => {
  it('đọc trên máy A → máy B nhận số chưa đọc mới', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await api(app, 'PUT', `/groups/${group.groupId}/moderators/${member.id}`, group.owner.token, {
      unitId: null,
    });
    await deliver();
    const tablet = await connect(await secondDevice(member));
    const unread = next<{ count: number }>(tablet, 'notification:unread');
    await api(app, 'POST', '/me/notifications/read', member.token, { all: true });
    expect(await unread).toEqual({ count: 0 });
  });

  it('đơn được duyệt → người xin nhận báo hiệu nhóm của mình đã đổi; có đơn mới → chủ nhóm nhận số đơn chờ', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const owner = await connect(group.owner.token);
    const applicant = await newUser(app);
    const applicantSocket = await connect(applicant.token);

    const pending = next<{ groupId: string; joinRequests: number }>(owner, 'group:pending');
    const joined = await api(app, 'POST', `/groups/${group.groupId}/join`, applicant.token, {});
    await deliver();
    expect(await pending).toEqual({ groupId: group.groupId, joinRequests: 1 });

    const changed = next<{ groupId: string }>(applicantSocket, 'me:groups-changed');
    const requestId = joined.json().data.request.id as string;
    await api(app, 'POST', `/group-join-requests/${requestId}/decision`, group.owner.token, {
      approve: true,
    });
    await deliver();
    expect(await changed).toEqual({ groupId: group.groupId });
  });
});

describe('độ trễ', () => {
  it('bộ phát đang chạy: thông báo tới máy trong một giây sau thao tác, không chờ vòng 10 giây', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const applicant = await newUser(app);
    const joined = await api(app, 'POST', `/groups/${group.groupId}/join`, applicant.token, {});
    await deliver();
    const phone = await connect(applicant.token);
    app.outbox.start();
    try {
      const notified = next<{ notification: { type: string } }>(phone, 'notification:new', 1000);
      const requestId = joined.json().data.request.id as string;
      await api(app, 'POST', `/group-join-requests/${requestId}/decision`, group.owner.token, {
        approve: true,
      });
      expect(await notified).toMatchObject({
        notification: { type: 'group.join_request.approved' },
      });
    } finally {
      await app.outbox.stop();
    }
  });
});
