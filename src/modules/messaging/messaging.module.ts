import type { AppModule } from '../../common/module/app-module.js';
import { registerMessagingListeners } from './messaging.events.js';
import { messagingOpsRoutes } from './messaging.ops.routes.js';
import { messagingRoutes } from './messaging.routes.js';
import {
  createMessagingService,
  type MessagingService,
  type MessagingServiceDeps,
} from './messaging.service.js';

export function createMessagingModule(deps: MessagingServiceDeps): {
  service: MessagingService;
  module: AppModule;
} {
  const service = createMessagingService(deps);
  return {
    service,
    module: {
      name: 'messaging',
      routes: async (app) => {
        await app.register(messagingRoutes, { messaging: service });
        await app.register(messagingOpsRoutes, { messaging: service });
      },
      listeners: (dispatcher) => registerMessagingListeners(dispatcher, service),
    },
  };
}
