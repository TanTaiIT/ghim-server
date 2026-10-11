import type { Notification } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { OutboxEventRef } from '../../common/outbox/dispatcher.js';
import type { Realtime } from '../../common/realtime/realtime.js';
import { sequentially } from '../../common/utils/sequential.js';
import type { AccountSummary } from '../identity/identity.service.js';
import {
  GROUP_MATRIX,
  type GroupFanOut,
  type MatrixContext,
  type NoticeDraft,
} from './notification.matrix.js';
import type { NotificationRepository, NotificationRow } from './notification.repository.js';
import {
  ALWAYS_ON,
  NOTIFICATION_CATEGORIES,
  type MarkReadInput,
  type NotificationCategory,
  type NotificationDto,
  type PreferencesDto,
} from './notification.schema.js';

/** `group` trả lời ai là thành viên, ai quản trị — `notification` không đọc bảng của `group` (TK 30). */
export interface NotificationGroupPort {
  findGroup(groupId: string): Promise<{ id: string; name: string } | null>;
  managerIds(groupId: string): Promise<string[]>;
  moderatorIds(groupId: string): Promise<string[]>;
  memberIds(
    groupId: string,
    query: { unitId?: string; after?: string; take: number },
  ): Promise<string[]>;
  ownerId(groupId: string): Promise<string | null>;
  unitName(groupId: string, unitId: string): Promise<string | null>;
  announcementBody(announcementId: string): Promise<string | null>;
  countPendingRequests(groupId: string): Promise<number>;
  isMember(groupId: string, accountId: string): Promise<boolean>;
}

export interface NotificationServiceDeps {
  repository: NotificationRepository;
  groups: NotificationGroupPort;
  identity: { accountSummaries(ids: string[]): Promise<Map<string, AccountSummary>> };
  realtime: Realtime;
  config: RuntimeConfig;
  clock: () => Date;
}

export interface NotificationService {
  /** Bên nghe outbox: áp ma trận cho một sự kiện `group.*`; sự kiện không có trong ma trận thì không làm gì. */
  handleGroupEvent(payload: Record<string, unknown>, event: OutboxEventRef): Promise<void>;
  inbox(
    actor: Actor,
    page: { skip: number; take: number },
  ): Promise<{ items: NotificationDto[]; total: number }>;
  unreadCount(actor: Actor): Promise<number>;
  markRead(actor: Actor, input: MarkReadInput): Promise<number>;
  preferences(actor: Actor): Promise<PreferencesDto>;
  setPreference(actor: Actor, category: NotificationCategory, enabled: boolean): Promise<void>;
  setGroupMute(actor: Actor, groupId: string, muted: boolean): Promise<void>;
}

/** Trang người nhận khi báo cả nhóm: đủ lớn để ít lượt, đủ nhỏ để một câu `INSERT` không phình (design mục 4). */
const FAN_OUT_PAGE = 1000;
const MINUTE_MS = 60_000;

export const toNotificationDto = (row: Notification): NotificationDto => ({
  id: row.id,
  category: row.category,
  type: row.type,
  title: row.title,
  body: row.body,
  detail: row.detail,
  data: row.data as Record<string, string | null>,
  groupId: row.groupId,
  count: row.count,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Đường đi của mọi thông báo (TK 24): sự kiện → ma trận → hộp thư → realtime. Cờ `alert` (nhắc) tính một lần lúc
 * ghi — bật tắt nhóm thông báo, tắt tiếng nhóm (trừ chuyện về chính mình), trần gộp — nên ngày có push chỉ cần
 * đọc cờ đó (design mục 3).
 */
export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { repository, groups, identity, realtime, config, clock } = deps;

  const context: MatrixContext = {
    group: (groupId) => groups.findGroup(groupId),
    managers: (groupId) => groups.managerIds(groupId),
    moderators: (groupId) => groups.moderatorIds(groupId),
    owner: (groupId) => groups.ownerId(groupId),
    async names(ids) {
      const summaries = await identity.accountSummaries(ids);
      return new Map([...summaries].map(([id, summary]) => [id, summary.displayName]));
    },
    unitName: (groupId, unitId) => groups.unitName(groupId, unitId),
    async announcement(id) {
      const body = await groups.announcementBody(id);
      return body === null ? null : { body };
    },
    pendingCount: (groupId) => groups.countPendingRequests(groupId),
  };

  /** Ai trong danh sách được nhắc — thông báo vẫn vào hộp thư của tất cả. */
  const alertable = async (
    draft: Omit<NoticeDraft, 'recipients'>,
    recipients: string[],
  ): Promise<Set<string>> => {
    if (!draft.alertable || recipients.length === 0) return new Set();
    const disabled = await repository.disabledCategories(recipients);
    const muted =
      draft.groupId && !draft.personal
        ? await repository.mutedAmong(draft.groupId, recipients)
        : new Set<string>();
    return new Set(
      recipients.filter(
        (id) =>
          (draft.category === ALWAYS_ON || !disabled.get(id)?.has(draft.category)) &&
          !muted.has(id),
      ),
    );
  };

  const publishUnread = async (recipients: string[]): Promise<void> => {
    const counts = await repository.unreadCounts(recipients);
    for (const [recipientId, count] of counts) {
      realtime.emitToUser(recipientId, 'notification:unread', { count });
    }
  };

  const emitNew = (
    rows: Notification[],
    alerts: Set<string>,
    event: 'notification:new' | 'notification:updated',
  ) => {
    for (const row of rows) {
      realtime.emitToUser(row.recipientId, event, {
        notification: toNotificationDto(row),
        alert: alerts.has(row.recipientId),
      });
    }
  };

  /** Ghi một loại thông báo cho một nhóm người; dòng gộp thì cập nhật dòng chưa đọc thay vì thêm. */
  const deliver = async (
    draft: Omit<NoticeDraft, 'recipients'>,
    recipients: string[],
    eventId: string,
    detailFor?: GroupFanOut['detailFor'],
  ): Promise<void> => {
    const unique = [...new Set(recipients)];
    if (unique.length === 0) return;
    const now = clock();
    const alerts = await alertable(draft, unique);
    const withDetail = new Set(detailFor?.recipients ?? []);
    const rowOf = (recipientId: string, body = draft.body): NotificationRow => ({
      recipientId,
      category: draft.category,
      type: draft.type,
      title: draft.title,
      body,
      detail: withDetail.has(recipientId) ? (detailFor?.detail ?? null) : (draft.detail ?? null),
      data: draft.data,
      groupId: draft.groupId,
      collapseKey: draft.collapse?.key ?? null,
      alert: alerts.has(recipientId),
    });

    if (!draft.collapse) {
      const inserted = await repository.insertMany(
        unique.map((id) => rowOf(id)),
        eventId,
        now,
      );
      emitNew(inserted, alerts, 'notification:new');
      await publishUnread(inserted.map((row) => row.recipientId));
      return;
    }

    const { key, render } = draft.collapse;
    const windowStart = now.getTime() - config.get('notification.collapseAlertMinutes') * MINUTE_MS;
    const fresh: string[] = [];
    const bumped: Notification[] = [];
    const bumpedAlerts = new Set<string>();
    await sequentially(unique, async (recipientId) => {
      const open = await repository.findOpenCollapsed(recipientId, key);
      if (!open) {
        fresh.push(recipientId);
        return;
      }
      const alert = alerts.has(recipientId) && (open.alertedAt?.getTime() ?? 0) <= windowStart;
      const updated = await repository.bumpCollapsed({
        id: open.id,
        sourceEventId: eventId,
        title: draft.title,
        body: render(open.count + 1),
        alert,
        at: now,
      });
      if (updated) {
        bumped.push(updated);
        if (alert) bumpedAlerts.add(recipientId);
      }
    });
    const inserted = await repository.insertMany(
      fresh.map((id) => rowOf(id)),
      eventId,
      now,
    );
    emitNew(inserted, alerts, 'notification:new');
    emitNew(bumped, bumpedAlerts, 'notification:updated');
    await publishUnread([...inserted, ...bumped].map((row) => row.recipientId));
  };

  /** Báo cả nhóm theo trang người nhận (khoá `account_id`), không nạp cả nhóm một lượt. */
  const fanOut = async (fan: GroupFanOut, eventId: string): Promise<void> => {
    const exclude = new Set(fan.exclude);
    const page = async (after?: string): Promise<void> => {
      const ids = await groups.memberIds(fan.groupId, {
        ...(fan.unitId ? { unitId: fan.unitId } : {}),
        ...(after ? { after } : {}),
        take: FAN_OUT_PAGE,
      });
      await deliver(
        fan.draft,
        ids.filter((id) => !exclude.has(id)),
        eventId,
        fan.detailFor,
      );
      const last = ids.at(-1);
      if (ids.length === FAN_OUT_PAGE && last) await page(last);
    };
    await page();
  };

  return {
    async handleGroupEvent(payload, event) {
      const handler = GROUP_MATRIX[event.type];
      if (!handler) return;
      const result = await handler(payload, context);
      await sequentially(result.drafts, ({ recipients, ...draft }) =>
        deliver(draft, recipients, event.id),
      );
      await sequentially(result.fanOuts, (fan) => fanOut(fan, event.id));
      for (const hint of result.hints) {
        for (const recipientId of new Set(hint.recipients)) {
          realtime.emitToUser(recipientId, hint.event, hint.payload);
        }
      }
    },

    async inbox(actor, page) {
      const { items, total } = await repository.list(actor.accountId, page);
      return { items: items.map(toNotificationDto), total };
    },

    async unreadCount(actor) {
      return (await repository.unreadCounts([actor.accountId])).get(actor.accountId) ?? 0;
    },

    async markRead(actor, input) {
      const count = await repository.markRead(
        actor.accountId,
        'all' in input ? 'all' : input.ids,
        clock(),
      );
      if (count === null) throw new NotFoundError('Không có thông báo này');
      await publishUnread([actor.accountId]);
      return count;
    },

    async preferences(actor) {
      const disabled = (await repository.disabledCategories([actor.accountId])).get(
        actor.accountId,
      );
      return {
        categories: NOTIFICATION_CATEGORIES.map((category) => ({
          category,
          enabled: category === ALWAYS_ON || !disabled?.has(category),
        })),
        mutedGroupIds: await repository.mutedGroups(actor.accountId),
      };
    },

    async setPreference(actor, category, enabled) {
      if (category === ALWAYS_ON && !enabled) {
        throw new BadRequestError(
          'Thông báo về tài khoản luôn bật',
          'NOTIFICATION_GROUP_ALWAYS_ON',
        );
      }
      await repository.setPreference(actor.accountId, category, enabled);
    },

    async setGroupMute(actor, groupId, muted) {
      if (muted && !(await groups.isMember(groupId, actor.accountId))) {
        throw new ConflictError('Bạn không phải thành viên của nhóm này', 'NOT_GROUP_MEMBER');
      }
      await repository.setMute(actor.accountId, groupId, muted, clock());
    },
  };
}
