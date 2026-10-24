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
    },
  };
}
