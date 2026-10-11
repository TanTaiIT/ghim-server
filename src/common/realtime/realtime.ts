import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';

import type { Actor } from '../auth/actor.js';

/**
 * Kênh realtime chỉ chiều server → app (design `add-notification-core` mục 2): app làm gì cũng qua HTTP, quyền chỉ
 * kiểm ở một chỗ. Đây là kênh báo hiệu, không phải nguồn sự thật — mất kết nối thì app tải lại qua HTTP.
 */
export interface Realtime {
  emitToUser(accountId: string, event: string, payload: unknown): void;
  /** Khoá hay xoá tài khoản: mọi kết nối của người đó chết cùng phiên HTTP. */
  disconnectUser(accountId: string): void;
  /** Một phiên bị thu hồi: chỉ kết nối mở bằng phiên đó. */
  disconnectSession(sessionId: string): void;
}

/** Cho test HTTP và lúc chưa có server — phát vào hư không. */
export const noopRealtime: Realtime = {
  emitToUser: () => {},
  disconnectUser: () => {},
  disconnectSession: () => {},
};

export const REALTIME_PATH = '/realtime';

export interface RealtimeGatewayDeps {
  /** Kiểm chữ ký và hạn của access token; trả mã phiên và lúc hết hạn (giây). */
  verifyToken(token: string): { sid: string; exp: number };
  resolveActor(sessionId: string): Promise<Actor>;
  corsOrigin: string | string[];
}

interface SocketIdentity {
  accountId: string;
  sessionId: string;
  exp: number;
}

const userRoom = (accountId: string) => `user:${accountId}`;
const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/**
 * Gắn socket.io vào cùng HTTP server của Fastify. Chỉ có phòng theo người và theo phiên — không phòng theo nhóm, nên
 * vào nhóm giữa phiên không phải nối lại (bài học của hệ cũ); thông báo nhóm gửi tới từng người nhận đã tính sẵn.
 */
export function createRealtimeGateway(
  server: HttpServer,
  deps: RealtimeGatewayDeps,
): Realtime & { close(): Promise<void> } {
  const io = new Server(server, {
    path: REALTIME_PATH,
    // Chỉ websocket: không long-polling thì ngày chạy nhiều tiến trình không cần sticky session.
    transports: ['websocket'],
    cors: { origin: deps.corsOrigin },
    serveClient: false,
  });

  // Không ném: mọi lỗi (token sai, phiên đã thu hồi, tài khoản khoá) đều thành `null` — socket.io bỏ qua promise
  // của middleware nên lỗi ném ra sẽ thành unhandled rejection.
  const authenticate = async (token: unknown): Promise<SocketIdentity | null> => {
    if (typeof token !== 'string') return null;
    try {
      const claims = deps.verifyToken(token);
      const actor = await deps.resolveActor(claims.sid);
      return { accountId: actor.accountId, sessionId: actor.sessionId, exp: claims.exp };
    } catch {
      return null;
    }
  };

  io.use(async (socket, next) => {
    const identity = await authenticate(socket.handshake.auth['token']);
    if (!identity) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    socket.data = identity;
    next();
  });

  io.on('connection', (socket) => {
    const { accountId, sessionId, exp } = socket.data as SocketIdentity;
    void socket.join([userRoom(accountId), sessionRoom(sessionId)]);
    // Hết hạn access token thì ngắt: app nối lại bằng token mới, và phiên được kiểm lại lúc bắt tay.
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, exp * 1000 - Date.now()));
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
  });

  return {
    emitToUser: (accountId, event, payload) => {
      io.to(userRoom(accountId)).emit(event, payload);
    },
    disconnectUser: (accountId) => {
      io.in(userRoom(accountId)).disconnectSockets(true);
    },
    disconnectSession: (sessionId) => {
      io.in(sessionRoom(sessionId)).disconnectSockets(true);
    },
    // Chỉ cắt kết nối và đóng engine — `io.close()` còn đóng luôn HTTP server, việc đó là của Fastify.
    close: async () => {
      io.disconnectSockets(true);
      io.engine.close();
    },
  };
}
