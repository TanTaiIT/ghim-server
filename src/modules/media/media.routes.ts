import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { uploadBodySchema, uploadGrantSchema } from './media.schema.js';
import type { MediaService } from './media.service.js';

export interface MediaRoutesOptions {
  media: MediaService;
}

/** Xin quyền tải ảnh (TK 25). Lưu ảnh vào chủ là route của chủ (vd `PUT /me/avatar`), không ở đây. */
export const mediaRoutes: FastifyPluginAsyncZod<MediaRoutesOptions> = async (app, { media }) => {
  app.post('/media/uploads', {
    preHandler: [app.authenticate, app.requireVerifiedEmail],
    schema: {
      tags: ['Media'],
      summary:
        'Xin quyền tải đúng một ảnh thẳng vào kho cho một chủ của mình — tải theo `upload.method`: `PUT` thân tệp kèm đúng `upload.headers`, hay `POST` biểu mẫu gồm nguyên văn `upload.fields` rồi tệp ở trường `file`',
      security: [{ bearerAuth: [] }],
      body: uploadBodySchema,
      response: {
        201: ok(uploadGrantSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        429: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await media.requestUpload(actorOf(request), request.body))),
  });
};
