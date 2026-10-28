import type { AppModule } from '../../common/module/app-module.js';
import { GROUP_EVENTS } from '../group/group.outbox.js';
import { LISTING_NOTICE_EVENTS } from './notification.listing-matrix.js';
import { MEDIA_NOTICE_EVENTS } from './notification.media-matrix.js';
import { registerNotificationJobs } from './notification.jobs.js';
import { MESSAGING_NOTICE_EVENTS } from './notification.messaging-matrix.js';
import { REVIEW_NOTICE_EVENTS } from './notification.review-matrix.js';
import { TRUST_NOTICE_EVENTS } from './notification.trust-matrix.js';
import { WALLET_NOTICE_EVENTS } from './notification.wallet-matrix.js';
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
      // Nghe mọi sự kiện `group.*`, các sự kiện `listing.*`, `media.*`, `review.*`, `trust.*`, `screening.*`,
      // `wallet.*` có dòng ma trận; ma trận quyết loại nào thành thông báo.
      listeners: (dispatcher) => {
        for (const type of [
          ...Object.values(GROUP_EVENTS),
          ...LISTING_NOTICE_EVENTS,
          ...MEDIA_NOTICE_EVENTS,
          ...REVIEW_NOTICE_EVENTS,
          ...MESSAGING_NOTICE_EVENTS,
          ...TRUST_NOTICE_EVENTS,
          ...WALLET_NOTICE_EVENTS,
        ]) {
          dispatcher.register(type, (payload, event) => service.handleEvent(payload, event));
        }
      },
      jobs: (jobs) => registerNotificationJobs(jobs, service),
    },
  };
}
