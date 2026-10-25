import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import { emptySchema } from '../../identity/identity.schema.js';
import {
  helpOrderBodySchema,
  helpTopicBodySchema,
  helpTopicParamsSchema,
  helpTopicSchema,
} from '../platform.schema.js';
import type { HelpService } from './help.service.js';

export interface HelpRoutesOptions {
  help: HelpService;
}

const TAGS_READ = ['Help'];
const TAGS_OPS = ['Ops · Help'];
const bearer = [{ bearerAuth: [] }];

/** Trợ giúp (add-help-content): đọc không cần đăng nhập; soạn, xoá, sắp xếp chỉ master. */
export const helpRoutes: FastifyPluginAsyncZod<HelpRoutesOptions> = async (app, { help }) => {
  const master = [app.authenticate, app.requireMaster];

  app.get('/help/topics', {
    schema: {
      tags: TAGS_READ,
      summary: 'Chủ đề trợ giúp và câu hỏi / đáp, theo thứ tự master xếp — không cần đăng nhập',
      response: { 200: ok(z.array(helpTopicSchema)) },
    },
    handler: async () => toOk(await help.helpTopics()),
  });

  app.post('/ops/help/topics', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Thêm một chủ đề trợ giúp — đứng cuối danh sách',
      security: bearer,
      body: helpTopicBodySchema,
      response: {
        201: ok(helpTopicSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await help.createHelpTopic(actorOf(request), request.body))),
  });

  app.put('/ops/help/topics/:id', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Sửa cả một chủ đề: tên và mọi câu hỏi / đáp',
      security: bearer,
      params: helpTopicParamsSchema,
      body: helpTopicBodySchema,
      response: {
        200: ok(helpTopicSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await help.updateHelpTopic(actorOf(request), request.params.id, request.body)),
  });

  app.delete('/ops/help/topics/:id', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Xoá một chủ đề trợ giúp',
      security: bearer,
      params: helpTopicParamsSchema,
      response: {
        204: emptySchema,
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request, reply) => {
      await help.deleteHelpTopic(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.put('/ops/help/order', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Sắp lại các chủ đề — gửi mã mọi chủ đề theo thứ tự mới; danh sách vừa đổi thì 409',
      security: bearer,
      body: helpOrderBodySchema,
      response: {
        204: emptySchema,
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) => {
      await help.reorderHelpTopics(actorOf(request), request.body.ids);
      return reply.status(204).send(null);
    },
  });
};
