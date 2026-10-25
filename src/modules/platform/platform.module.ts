import type { AppModule } from '../../common/module/app-module.js';
import { helpRoutes } from './help/help.routes.js';
import { createHelpService } from './help/help.service.js';
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
  // Trợ giúp không module nào khác gọi: dựng ở đây, không nằm trong `PlatformService`.
  const help = createHelpService({ repository: deps.repository, clock: deps.clock });
  return {
    service,
    module: {
      name: 'platform',
      routes: async (app) => {
        await app.register(platformOpsRoutes, { platform: service });
        await app.register(helpRoutes, { help });
      },
      listeners: (dispatcher) => registerPlatformListeners(dispatcher, service),
      startup: () => service.ensureConfigVersion(),
    },
  };
}
