import type { AppModule } from '../../common/module/app-module.js';
import type { CategoryRepository } from './category.repository.js';
import { categoryRoutes } from './category.routes.js';
import { createCategoryService, type CategoryService } from './category.service.js';

export interface CategoryModuleDeps {
  repository: CategoryRepository;
  clock: () => Date;
}

export function createCategoryModule(deps: CategoryModuleDeps): {
  service: CategoryService;
  module: AppModule;
} {
  const service = createCategoryService(deps);
  return {
    service,
    module: {
      name: 'category',
      routes: async (app) => {
        await app.register(categoryRoutes, { category: service });
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
