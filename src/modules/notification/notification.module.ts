import type { AppModule } from '../../common/module/app-module.js';
import { GROUP_EVENTS } from '../group/group.outbox.js';
import { notificationRoutes } from './notification.routes.js';
import {
  createNotificationService,
  type NotificationService,
  type NotificationServiceDeps,
} from './notification.service.js';

export function createNotificationModule(deps: NotificationServiceDeps): {
  service: NotificationService;
  module: AppModule;
} {
  const service = createNotificationService(deps);
  return {
    service,
    module: {
      name: 'notification',
      routes: async (app) => {
        await app.register(notificationRoutes, { notification: service });
      },
      // Nghe mọi sự kiện `group.*`; ma trận quyết loại nào thành thông báo, loại nào bỏ qua.
      listeners: (dispatcher) => {
        for (const type of Object.values(GROUP_EVENTS)) {
          dispatcher.register(type, (payload, event) => service.handleGroupEvent(payload, event));
        }
      },
    },
  };
}
