import type { AppModule } from '../../common/module/app-module.js';
import { registerPlatformListeners } from './platform.events.js';
import { platformOpsRoutes } from './platform.ops.routes.js';
import {
  createPlatformService,
  type PlatformService,
  type PlatformServiceDeps,
} from './platform.service.js';

export function createPlatformModule(deps: PlatformServiceDeps): {
  service: PlatformService;
  module: AppModule;
} {
  const service = createPlatformService(deps);
  return {
    service,
    module: {
      name: 'platform',
      routes: async (app) => {
        await app.register(platformOpsRoutes, { platform: service });
      },
      listeners: (dispatcher) => registerPlatformListeners(dispatcher, service),
      startup: () => service.ensureConfigVersion(),
    },
  };
}
