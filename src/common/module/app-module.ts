import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Jobs } from '../../lib/jobs.js';
import type { OutboxDispatcher } from '../outbox/dispatcher.js';

/**
 * Những gì app cần biết về một module, do chính module khai (change harden-module-infra): `buildApp`
 * và `server.ts` chỉ lặp qua danh sách, nên thêm một module là thêm một file `<module>.module.ts` và
 * một dòng trong danh sách — không sửa `AppDeps`, không thêm decorate, không thêm bước khởi động tay.
 */
export interface AppModule {
  name: string;
  /** Đăng ký dưới tiền tố `/api/v1`. Module hạ tầng (vd `outbox`) không có route. */
  routes?: FastifyPluginAsyncZod;
  /** Bên nghe outbox; `server.ts` gọi trước khi bật bộ phát. */
  listeners?: (dispatcher: OutboxDispatcher) => void;
  /** Việc nền (theo sự kiện và theo lịch); `buildApp` gọi trước khi `jobs.start()`. */
  jobs?: (jobs: Jobs) => Promise<void>;
  /** Bước khởi động, chạy theo thứ tự danh sách; trả kết quả để log, `null` = không phải làm gì. */
  startup?: () => Promise<Record<string, unknown> | null>;
}
