import type { AppModule } from '../../common/module/app-module.js';
import type { RegionRepository } from './region.repository.js';
import { regionRoutes } from './region.routes.js';
import { createRegionService, type RegionService } from './region.service.js';

export interface RegionModuleDeps {
  repository: RegionRepository;
}

export function createRegionModule(deps: RegionModuleDeps): {
  service: RegionService;
  module: AppModule;
} {
  const service = createRegionService(deps);
  return {
    service,
    module: {
      name: 'region',
      routes: async (app) => {
        await app.register(regionRoutes, { region: service });
      },
      // Khu vực nạp một lần khi bảng rỗng; cập nhật địa giới về sau là một migration dữ liệu riêng.
      startup: async () => {
        const seeded = await service.seedRegionsIfEmpty();
        return seeded.provinces > 0
          ? { seededProvinces: seeded.provinces, seededWards: seeded.wards }
          : null;
      },
    },
  };
}
