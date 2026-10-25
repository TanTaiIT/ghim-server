import { auditActor } from '../../../common/audit/audit.js';
import type { Actor } from '../../../common/auth/actor.js';
import { ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import type { HelpTopic, PlatformRepository } from '../platform.repository.js';
import { helpTopicSchema, type HelpTopicBody, type HelpTopicDto } from '../platform.schema.js';

export interface HelpServiceDeps {
  repository: PlatformRepository;
  clock: () => Date;
}

/** Trợ giúp (add-help-content): ai cũng đọc; chỉ master soạn — route đã chặn người khác trước khi tới đây. */
export interface HelpService {
  helpTopics(): Promise<HelpTopicDto[]>;
  createHelpTopic(actor: Actor, body: HelpTopicBody): Promise<HelpTopicDto>;
  updateHelpTopic(actor: Actor, id: string, body: HelpTopicBody): Promise<HelpTopicDto>;
  deleteHelpTopic(actor: Actor, id: string): Promise<void>;
  reorderHelpTopics(actor: Actor, ids: string[]): Promise<void>;
}

const topicNotFound = (): NotFoundError => new NotFoundError('Không có chủ đề trợ giúp này');

/** `faqs` là jsonb: chỉ service này ghi, qua `helpTopicBodySchema` — đọc lại qua schema để kiểu không phải đoán. */
const toDto = (row: HelpTopic): HelpTopicDto =>
  helpTopicSchema.parse({ id: row.id, label: row.label, faqs: row.faqs });

const audit = (actor: Actor, action: `platform.help.${string}`, label?: string) => ({
  ...auditActor(actor),
  action,
  targetType: 'help_topic',
  ...(label === undefined ? {} : { details: { label } }),
});

export function createHelpService({ repository, clock }: HelpServiceDeps): HelpService {
  return {
    helpTopics: async () => (await repository.helpTopics()).map(toDto),

    createHelpTopic: async (actor, body) =>
      toDto(
        await repository.createHelpTopic(
          { ...body, at: clock() },
          audit(actor, 'platform.help.create', body.label),
        ),
      ),

    async updateHelpTopic(actor, id, body) {
      const row = await repository.updateHelpTopic(
        id,
        { ...body, at: clock() },
        { ...audit(actor, 'platform.help.update', body.label), targetId: id },
      );
      if (!row) throw topicNotFound();
      return toDto(row);
    },

    async deleteHelpTopic(actor, id) {
      const deleted = await repository.deleteHelpTopic(id, {
        ...audit(actor, 'platform.help.delete'),
        targetId: id,
      });
      if (!deleted) throw topicNotFound();
    },

    async reorderHelpTopics(actor, ids) {
      const done = await repository.reorderHelpTopics(ids, {
        ...audit(actor, 'platform.help.reorder'),
        targetId: 'all',
      });
      if (!done) throw new ConflictError('Danh sách chủ đề vừa đổi — tải lại rồi sắp lại');
    },
  };
}
