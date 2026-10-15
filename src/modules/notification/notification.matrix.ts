import type { RuntimeConfigKey } from '../../common/config/runtime-config.js';
import { formatDateVN } from '../../common/time/time.js';
import type { NotificationCategory } from './notification.schema.js';

/** Một loại thông báo cho một nhóm người nhận — văn bản đã sinh, cờ nhắc chưa tính (còn bật tắt, tắt tiếng, gộp). */
export interface NoticeDraft {
  recipients: string[];
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  detail?: string | null;
  data: Record<string, string | null>;
  groupId: string | null;
  /** Dòng ma trận có nhắc hay chỉ vào hộp thư. */
  alertable: boolean;
  /** Chuyện về chính tư cách của người nhận trong nhóm: tắt tiếng nhóm không chặn nhắc (TK 24, chốt 11/10/2026). */
  personal: boolean;
  /**
   * Chuyện lặp lại theo nhóm: cập nhật dòng chưa đọc cùng khoá thay vì thêm dòng (luật gộp). `alertMinutes` = khoá
   * trần nhắc riêng của dòng ma trận (mặc định `notification.collapseAlertMinutes`).
   */
  collapse?: { key: string; render: (count: number) => string; alertMinutes?: RuntimeConfigKey };
}

/** Thông báo tới mọi thành viên (hay một đơn vị) — người nhận lấy theo trang, không nạp cả nhóm một lượt. */
export interface GroupFanOut {
  groupId: string;
  unitId: string | null;
  exclude: string[];
  draft: Omit<NoticeDraft, 'recipients'>;
  /** Người trong danh sách này nhận `detail` (vd lý do khoá cho chủ nhóm, điều hành viên). */
  detailFor?: { recipients: string[]; detail: string };
}

/** Báo hiệu realtime không vào hộp thư — app tải lại đúng màn (design `add-notification-core` mục 1). */
export interface Hint {
  recipients: string[];
  event: 'me:groups-changed' | 'group:pending';
  payload: Record<string, unknown>;
}

export interface MatrixResult {
  drafts: NoticeDraft[];
  fanOuts: GroupFanOut[];
  hints: Hint[];
}

/** Những gì ma trận cần hỏi module khác — `group` và `identity` trả lời qua cổng, không đọc bảng của họ. */
export interface MatrixContext {
  group(groupId: string): Promise<{ id: string; name: string } | null>;
  managers(groupId: string): Promise<string[]>;
  moderators(groupId: string): Promise<string[]>;
  owner(groupId: string): Promise<string | null>;
  names(ids: string[]): Promise<Map<string, string>>;
  unitName(groupId: string, unitId: string): Promise<string | null>;
  announcement(id: string): Promise<{ body: string } | null>;
  pendingCount(groupId: string): Promise<number>;
  /** Tiêu đề tin theo mã — `listing` trả lời; tin không có (đã xoá hẳn) thì vắng trong kết quả. */
  listingTitles(ids: string[]): Promise<Map<string, string>>;
  /** Người đăng và tiêu đề của tin chưa xoá — `listing` trả lời; tin đã xoá hay không có thì vắng. */
  listingTargets(ids: string[]): Promise<Map<string, { ownerId: string; title: string | null }>>;
  /** Mọi master đang hoạt động — `identity` trả lời; người nhận của N40–N42. */
  masterIds(): Promise<string[]>;
}

export type Payload = Record<string, unknown>;
export type Handler = (payload: Payload, ctx: MatrixContext) => Promise<MatrixResult>;

export const str = (payload: Payload, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
};
export const num = (payload: Payload, key: string): number | null => {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
};
export const ids = (payload: Payload, key: string): string[] => {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};
export const empty = (): MatrixResult => ({ drafts: [], fanOuts: [], hints: [] });
export const date = (iso: string | null): string => (iso ? formatDateVN(new Date(iso)) : '');
const PREVIEW_LENGTH = 100;

/** Thông báo "nhóm của bạn" cho một người. */
const personal = (
  recipient: string,
  group: { id: string; name: string },
  type: string,
  body: string,
  options: { alertable: boolean; data?: Record<string, string | null> },
): NoticeDraft => ({
  recipients: [recipient],
  category: 'your_groups',
  type,
  title: group.name,
  body,
  data: { groupId: group.id, ...options.data },
  groupId: group.id,
  alertable: options.alertable,
  personal: true,
});

/** Hint "nhóm của tôi đã đổi" cho những người vừa đổi tư cách hay vai. */
const groupsChanged = (recipients: string[], groupId: string): Hint => ({
  recipients,
  event: 'me:groups-changed',
  payload: { groupId },
});

/**
 * Ma trận N1–N30 (design `add-notification-core` mục 1). Mỗi sự kiện `group.*` một hàm: ai nhận, câu gì, có nhắc
 * không. Luật chung: không báo người tự làm; quyết định của nhóm ký "Quản trị nhóm", không nêu tên ai; câu không
 * chứa lý do khoá hay cấm; nhóm thiếu chủ không nói chủ bị khoá. Sự kiện không có ở đây thì không báo ai.
 */
export const GROUP_MATRIX: Record<string, Handler> = {
  // N1, N2
  async 'group.owner.offered'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const to = str(payload, 'toAccountId');
    if (!group || !to) return empty();
    const until = date(str(payload, 'expiresAt'));
    const from = str(payload, 'fromAccountId');
    const fromName = from ? (await ctx.names([from])).get(from) : undefined;
    const body =
      str(payload, 'kind') === 'transfer' && fromName
        ? `«${fromName}» muốn chuyển quyền chủ nhóm «${group.name}» cho bạn. Đồng ý trước ${until}.`
        : `Bạn được giao làm chủ nhóm «${group.name}». Đồng ý trước ${until}.`;
    return {
      ...empty(),
      drafts: [
        personal(to, group, 'group.owner_offer.received', body, {
          alertable: true,
          data: { offerId: str(payload, 'offerId') },
        }),
      ],
    };
  },

  // N4, N5
  async 'group.owner.offer_decided'(payload, ctx) {
    const from = str(payload, 'fromAccountId');
    const outcome = str(payload, 'outcome');
    if (str(payload, 'kind') !== 'transfer' || !from) return empty();
    if (outcome !== 'declined' && outcome !== 'expired') return empty();
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const body =
      outcome === 'declined'
        ? `Lời chuyển chủ nhóm «${group.name}» đã bị từ chối.`
        : `Lời chuyển chủ nhóm «${group.name}» đã hết hạn.`;
    return {
      ...empty(),
      drafts: [
        personal(from, group, `group.owner_transfer.${outcome}`, body, {
          alertable: outcome === 'declined',
        }),
      ],
    };
  },

  // N3, N6, N12
  async 'group.owner.changed'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const newOwner = str(payload, 'newOwnerId');
    if (!group || !newOwner) return empty();
    const previous = str(payload, 'previousOwnerId');
    const cause = str(payload, 'cause');
    const newName = (await ctx.names([newOwner])).get(newOwner) ?? 'Người nhận';
    const drafts: NoticeDraft[] = [];
    if (previous && previous !== newOwner) {
      const body =
        cause === 'transfer'
          ? `«${newName}» đã nhận làm chủ nhóm «${group.name}».`
          : cause === 'assignment'
            ? `Quản trị Ghim đã giao quyền chủ nhóm «${group.name}» cho người khác. Bạn vẫn là thành viên.`
            : `Nhóm «${group.name}» đã có chủ nhóm mới.`;
      // Chủ cũ của nhóm thiếu chủ đang bị khoá — vẫn vào hộp thư để biết khi được mở khoá, nhắc thì vô nghĩa.
      drafts.push(
        personal(previous, group, 'group.owner.changed', body, {
          alertable: cause !== 'ownerless_confirmed',
        }),
      );
    }
    const moderators = (await ctx.moderators(group.id)).filter(
      (id) => id !== newOwner && id !== previous,
    );
    if (moderators.length > 0) {
      drafts.push({
        ...personal(
          moderators[0] ?? '',
          group,
          'group.owner.changed',
          `«${newName}» là chủ nhóm mới của «${group.name}».`,
          {
            alertable: false,
          },
        ),
        recipients: moderators,
        personal: false,
      });
    }
    return {
      ...empty(),
      drafts,
      hints: [groupsChanged([newOwner, ...(previous ? [previous] : [])], group.id)],
    };
  },

  // N10
  async 'group.ownerless.started'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const moderators = await ctx.moderators(group.id);
    if (moderators.length === 0) return empty();
    return {
      ...empty(),
      drafts: [
        {
          recipients: moderators,
          category: 'your_groups',
          type: 'group.ownerless.started',
          title: group.name,
          body: `Nhóm «${group.name}» tạm thời chưa có chủ. Việc hằng ngày vẫn tiếp tục; cài đặt khoá tới khi có chủ mới.`,
          data: { groupId: group.id },
          groupId: group.id,
          alertable: true,
          personal: false,
        },
      ],
    };
  },

  // N11
  async 'group.ownerless.resolved'(payload, ctx) {
    if (str(payload, 'outcome') !== 'owner_returned') return empty();
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const owner = await ctx.owner(group.id);
    const drafts: NoticeDraft[] = [];
    if (owner) {
      drafts.push(
        personal(
          owner,
          group,
          'group.owner.returned',
          `Bạn tiếp tục là chủ nhóm «${group.name}».`,
          { alertable: true },
        ),
      );
    }
    const moderators = await ctx.moderators(group.id);
    if (moderators.length > 0) {
      drafts.push({
        recipients: moderators,
        category: 'your_groups',
        type: 'group.owner.returned',
        title: group.name,
        body: `Chủ nhóm «${group.name}» đã trở lại.`,
        data: { groupId: group.id },
        groupId: group.id,
        alertable: false,
        personal: false,
      });
    }
    return { ...empty(), drafts };
  },

  // N13
  async 'group.state.locked'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const cause = str(payload, 'cause');
    const reason = str(payload, 'reason');
    const detail =
      cause === 'master'
        ? `Lý do: ${reason ?? 'không ghi'}`
        : cause === 'ownerless_timeout'
          ? 'Nhóm chưa có chủ quá thời hạn.'
          : 'Nhóm không còn ai giữ vai quản trị.';
    const managers = [
      ...new Set([...(await ctx.managers(group.id)), ...(await ctx.moderators(group.id))]),
    ];
    return {
      ...empty(),
      fanOuts: [
        {
          groupId: group.id,
          unitId: null,
          exclude: [],
          draft: {
            category: 'your_groups',
            type: 'group.state.locked',
            title: group.name,
            body: `Nhóm «${group.name}» đang tạm khoá. Mở app để xem chi tiết.`,
            data: { groupId: group.id },
            groupId: group.id,
            alertable: true,
            personal: false,
          },
          detailFor: { recipients: managers, detail },
        },
      ],
    };
  },

  // N14
  async 'group.state.unlocked'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    return {
      ...empty(),
      fanOuts: [
        {
          groupId: group.id,
          unitId: null,
          exclude: [],
          draft: {
            category: 'your_groups',
            type: 'group.state.unlocked',
            title: group.name,
            body: `Nhóm «${group.name}» đã mở khoá.`,
            data: { groupId: group.id },
            groupId: group.id,
            alertable: true,
            personal: false,
          },
        },
      ],
    };
  },

  // N15, N16, N17
  async 'group.state.closed'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const closedBy = str(payload, 'closedBy');
    const requesters = ids(payload, 'cancelledRequestAccountIds');
    const invitees = ids(payload, 'cancelledInviteeIds');
    const offerees = ids(payload, 'cancelledOfferAccountIds');
    const drafts: NoticeDraft[] = [];
    if (offerees.length > 0) {
      drafts.push({
        recipients: offerees,
        category: 'your_groups',
        type: 'group.owner_offer.cancelled',
        title: group.name,
        body: `Lời giao chủ nhóm «${group.name}» đã huỷ vì nhóm đã đóng.`,
        data: { groupId: group.id },
        groupId: group.id,
        alertable: false,
        personal: true,
      });
    }
    if (requesters.length > 0) {
      drafts.push({
        recipients: requesters,
        category: 'your_groups',
        type: 'group.join_request.cancelled',
        title: group.name,
        body: `Đơn vào «${group.name}» đã huỷ vì nhóm đã đóng.`,
        data: { groupId: group.id },
        groupId: group.id,
        alertable: true,
        personal: true,
      });
    }
    if (invitees.length > 0) {
      drafts.push({
        recipients: invitees,
        category: 'your_groups',
        type: 'group.invitation.cancelled',
        title: group.name,
        body: `Lời mời vào «${group.name}» đã huỷ vì nhóm đã đóng.`,
        data: { groupId: group.id },
        groupId: group.id,
        alertable: true,
        personal: true,
      });
    }
    return {
      ...empty(),
      drafts,
      fanOuts: [
        {
          groupId: group.id,
          unitId: null,
          exclude: closedBy ? [closedBy] : [],
          draft: {
            category: 'your_groups',
            type: 'group.state.closed',
            title: group.name,
            body: `Nhóm «${group.name}» đã đóng.`,
            data: { groupId: group.id },
            groupId: group.id,
            alertable: true,
            personal: true,
          },
        },
      ],
    };
  },

  // N18
  async 'group.mode.changed'(payload, ctx) {
    const from = str(payload, 'from') ?? '';
    const to = str(payload, 'to') ?? '';
    if (!from.startsWith('private') || !to.startsWith('public')) return empty();
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const actor = str(payload, 'actorId');
    return {
      ...empty(),
      fanOuts: [
        {
          groupId: group.id,
          unitId: null,
          exclude: actor ? [actor] : [],
          draft: {
            category: 'your_groups',
            type: 'group.mode.public',
            title: group.name,
            body: `Nhóm «${group.name}» giờ là nhóm công khai. Tin «chỉ thành viên» của bạn vẫn chỉ thành viên xem.`,
            data: { groupId: group.id },
            groupId: group.id,
            alertable: true,
            personal: false,
          },
        },
      ],
    };
  },

  // N20
  async 'group.join_request.created'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const managers = await ctx.managers(group.id);
    const pending = await ctx.pendingCount(group.id);
    return {
      ...empty(),
      drafts:
        managers.length > 0
          ? [
              {
                recipients: managers,
                category: 'your_groups',
                type: 'group.join_request.pending',
                title: group.name,
                body: `«${group.name}» có 1 đơn xin vào mới đang chờ duyệt.`,
                data: { groupId: group.id },
                groupId: group.id,
                alertable: true,
                personal: false,
                collapse: {
                  key: `group:${group.id}:join-requests`,
                  render: (count) => `«${group.name}» có ${count} đơn xin vào mới đang chờ duyệt.`,
                },
              },
            ]
          : [],
      hints: [
        {
          recipients: managers,
          event: 'group:pending',
          payload: { groupId: group.id, joinRequests: pending },
        },
      ],
    };
  },

  // N19, N21, N22, N23
  async 'group.join_request.decided'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const applicant = str(payload, 'accountId');
    if (!group || !applicant) return empty();
    const outcome = str(payload, 'outcome');
    const managers = await ctx.managers(group.id);
    const pending: Hint = {
      recipients: managers,
      event: 'group:pending',
      payload: { groupId: group.id, joinRequests: await ctx.pendingCount(group.id) },
    };
    const drafts: NoticeDraft[] = [];
    const hints: Hint[] = [pending];
    if (outcome === 'approved') {
      drafts.push(
        personal(
          applicant,
          group,
          'group.join_request.approved',
          `Bạn đã là thành viên «${group.name}».`,
          { alertable: true },
        ),
      );
      hints.push(groupsChanged([applicant], group.id));
    } else if (outcome === 'rejected') {
      const retry = date(str(payload, 'reapplyAt'));
      drafts.push(
        personal(
          applicant,
          group,
          'group.join_request.rejected',
          `Quản trị nhóm «${group.name}» chưa duyệt đơn của bạn. Bạn gửi lại được từ ${retry}.`,
          { alertable: true },
        ),
      );
    } else if (outcome === 'expired') {
      drafts.push(
        personal(
          applicant,
          group,
          'group.join_request.expired',
          `Đơn vào «${group.name}» đã hết hạn. Bạn có thể gửi lại.`,
          {
            alertable: false,
          },
        ),
      );
    } else if (outcome === 'cancelled' && str(payload, 'reason') === 'mode_open') {
      drafts.push(
        personal(
          applicant,
          group,
          'group.join_request.cancelled',
          `«${group.name}» giờ bấm Tham gia là vào — đơn của bạn không cần duyệt nữa.`,
          { alertable: true },
        ),
      );
    }
    return { drafts, fanOuts: [], hints };
  },

  // N24
  async 'group.invitation.created'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const invitee = str(payload, 'accountId');
    if (!group || !invitee) return empty();
    return {
      ...empty(),
      drafts: [
        personal(
          invitee,
          group,
          'group.invitation.received',
          `Bạn được mời vào «${group.name}». Lời mời còn hạn tới ${date(str(payload, 'expiresAt'))}.`,
          { alertable: true, data: { invitationId: str(payload, 'invitationId') } },
        ),
      ],
    };
  },

  // N25
  async 'group.roster.matched'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const people = ids(payload, 'accountIds');
    if (!group || people.length === 0) return empty();
    return {
      ...empty(),
      drafts: [
        {
          recipients: people,
          category: 'your_groups',
          type: 'group.roster.listed',
          title: group.name,
          body: `Bạn có tên trong danh sách thành viên của «${group.name}». Mở để vào nhóm.`,
          data: { groupId: group.id },
          groupId: group.id,
          alertable: true,
          personal: true,
        },
      ],
    };
  },

  // N26, N27 — chỉ người đang là thành viên; cấm người chưa từng vào thì không báo gì.
  async 'group.member.left'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const member = str(payload, 'accountId');
    if (!group || !member) return empty();
    const reason = str(payload, 'reason');
    const hints = [groupsChanged([member], group.id)];
    if (reason === 'removed') {
      return {
        ...empty(),
        hints,
        drafts: [
          personal(
            member,
            group,
            'group.member.removed',
            `Bạn không còn là thành viên «${group.name}».`,
            { alertable: true },
          ),
        ],
      };
    }
    if (reason === 'banned') {
      return {
        ...empty(),
        hints,
        drafts: [
          personal(
            member,
            group,
            'group.member.banned',
            `Bạn không còn là thành viên «${group.name}» và không vào lại nhóm này được.`,
            { alertable: true },
          ),
        ],
      };
    }
    return { ...empty(), hints };
  },

  // Vào nhóm không báo ai (nhóm đông thì thành tiếng ồn), chỉ báo hiệu cho chính người vào.
  async 'group.member.joined'(payload) {
    const member = str(payload, 'accountId');
    const groupId = str(payload, 'groupId');
    return member && groupId ? { ...empty(), hints: [groupsChanged([member], groupId)] } : empty();
  },

  // N28
  async 'group.ban.lifted'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const person = str(payload, 'accountId');
    if (!group || !person) return empty();
    return {
      ...empty(),
      drafts: [
        personal(
          person,
          group,
          'group.ban.lifted',
          `Bạn đã được gỡ cấm ở «${group.name}» và có thể xin vào lại.`,
          {
            alertable: false,
          },
        ),
      ],
    };
  },

  // N29
  async 'group.member.unit_changed'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const member = str(payload, 'accountId');
    if (!group || !member) return empty();
    const unitId = str(payload, 'unitId');
    const unit = unitId ? await ctx.unitName(group.id, unitId) : null;
    const body = unit
      ? `Bạn được xếp vào «${unit}» trong nhóm «${group.name}».`
      : `Bạn không còn thuộc đơn vị nào trong nhóm «${group.name}».`;
    return {
      ...empty(),
      drafts: [personal(member, group, 'group.member.unit_changed', body, { alertable: false })],
      hints: [groupsChanged([member], group.id)],
    };
  },

  // N7, N8, N9
  async 'group.moderator.changed'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const member = str(payload, 'accountId');
    if (!group || !member) return empty();
    const change = str(payload, 'change');
    const unitId = str(payload, 'unitId');
    const unit = unitId ? await ctx.unitName(group.id, unitId) : null;
    const scope = unit ? ` (phụ trách «${unit}»)` : '';
    const [type, body, alertable] =
      change === 'appointed'
        ? ['group.moderator.appointed', `Bạn là điều hành viên của «${group.name}»${scope}.`, true]
        : change === 'dismissed'
          ? [
              'group.moderator.dismissed',
              `Bạn không còn là điều hành viên của «${group.name}».`,
              true,
            ]
          : [
              'group.moderator.scope_changed',
              `Phạm vi điều hành của bạn ở «${group.name}» đã đổi${scope}.`,
              false,
            ];
    return {
      ...empty(),
      drafts: [personal(member, group, type, body, { alertable })],
      hints: [groupsChanged([member], group.id)],
    };
  },

  // N30
  async 'group.announcement.posted'(payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    const announcementId = str(payload, 'announcementId');
    const announcement = announcementId ? await ctx.announcement(announcementId) : null;
    if (!group || !announcementId || !announcement) return empty();
    const author = str(payload, 'authorId');
    const preview = [...announcement.body].slice(0, PREVIEW_LENGTH).join('');
    return {
      ...empty(),
      fanOuts: [
        {
          groupId: group.id,
          unitId: str(payload, 'unitId'),
          exclude: author ? [author] : [],
          draft: {
            category: 'group_announcements',
            type: 'group.announcement.posted',
            title: group.name,
            body: preview,
            data: { groupId: group.id, announcementId },
            groupId: group.id,
            alertable: true,
            personal: false,
          },
        },
      ],
    };
  },
};
