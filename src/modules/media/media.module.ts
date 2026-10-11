import type { AppModule } from '../../common/module/app-module.js';
import { isProduction } from '../../config/env.js';
import { registerMediaJobs } from './media.jobs.js';
import { mediaRoutes } from './media.routes.js';
import { createMediaService, type MediaService, type MediaServiceDeps } from './media.service.js';

export function createMediaModule(deps: MediaServiceDeps): {
  service: MediaService;
  module: AppModule;
} {
  const service = createMediaService(deps);
  return {
    service,
    module: {
      name: 'media',
      routes: async (app) => {
        await app.register(mediaRoutes, { media: service });
      },
      jobs: (jobs) => registerMediaJobs(jobs, service),
      // Production: bucket do hạ tầng dựng, khoá API chỉ có quyền trên tệp — không kiểm, không tạo.
      startup: async () => {
        if (isProduction) return null;
        const { created } = await service.ensureStorage();
        return created ? { bucketCreated: deps.storage.bucket } : null;
      },
    },
  };
}
