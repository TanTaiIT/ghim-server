import type { OutboxEventType } from '../../common/outbox/outbox.js';
import type { MachineNotice } from '../listing/listing.ports.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import {
  date,
  empty,
  type Handler,
  ids,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  type Payload,
  str,
} from './notification.matrix.js';

type Change = 'added' | 'removed';

/**
 * N32: câu theo lý do tạm ẩn. Câu gỡ nói "không còn bị ẩn vì …", không nói "hiện lại": tin có thể còn lý do khác (vd
 * nhóm mở khoá lúc danh mục vẫn tắt). Bị cấm không nêu lý do — luật chung của ma trận: câu không chứa lý do khoá hay cấm.
 */
const HIDDEN_TEXT: Record<string, Record<Change, (group: string) => string>> = {
  group_locked: {
    added: (group) => `Nhóm «${group}» đang tạm khoá nên tin của bạn trong nhóm tạm ẩn.`,
    removed: (group) => `Nhóm «${group}» đã mở khoá, tin của bạn không còn bị ẩn vì nhóm khoá.`,
  },
  left_group: {
    added: (group) =>
      `Bạn đã rời nhóm «${group}» nên tin của bạn trong nhóm tạm ẩn — vào lại nhóm thì tin hiện lại.`,
    removed: (group) => `Bạn đã vào lại nhóm «${group}», tin của bạn không còn bị ẩn vì rời nhóm.`,
  },
  removed_from_group: {
    added: (group) => `Bạn không còn trong nhóm «${group}» nên tin của bạn trong nhóm tạm ẩn.`,
    removed: (group) => `Bạn đã vào lại nhóm «${group}», tin của bạn không còn bị ẩn vì rời nhóm.`,
  },
  group_banned: {
    added: (group) => `Tin của bạn trong nhóm «${group}» tạm ẩn.`,
    removed: (group) => `Tin của bạn trong nhóm «${group}» không còn bị ẩn bởi nhóm.`,
  },
  category_disabled: {
    added: () => 'Danh mục của tin bạn đang tạm tắt nên tin tạm ẩn.',
    removed: () => 'Danh mục đã bật lại, tin của bạn không còn bị ẩn vì danh mục.',
  },
};

const DETACHED_TEXT: Record<string, (group: string, until: string) => string> = {
  group_closed: (group, until) =>
    `Nhóm «${group}» đã đóng nên tin của bạn rời nhóm. Bạn có thể chuyển tin lên sàn chung trước ${until}.`,
  group_privatized: (group, until) =>
    `Nhóm «${group}» chuyển sang riêng tư nên tin của bạn rời nhóm. Bạn có thể chuyển tin lên sàn chung trước ${until}.`,
  detached_by_group: (group, until) =>
    `Quản trị nhóm «${group}» đã gỡ tin của bạn khỏi nhóm. Bạn có thể chuyển tin lên sàn chung trước ${until}.`,
};

const YOUR_LISTINGS = 'your_listings' as const;

/** Thông báo "tin của bạn" cho người đăng — chuyện về chính họ nên tắt tiếng nhóm không chặn nhắc. */
const toOwners = (
  recipients: string[],
  draft: Omit<NoticeDraft, 'recipients' | 'category' | 'personal'>,
): MatrixResult => ({
  ...empty(),
  drafts: [{ recipients, category: YOUR_LISTINGS, personal: true, ...draft }],
});

async function titleOf(ctx: MatrixContext, listingId: string | null): Promise<string | null> {
  if (!listingId) return null;
  return (await ctx.listingTitles([listingId])).get(listingId) ?? null;
}

// N31 — chỉ tin MỚI hiện đầy đủ trên bảng tin nhóm: không báo lượt qua máy sau sửa, khôi phục, tin hạn chế hay tạm ẩn.
async function groupNewListing(payload: Payload, ctx: MatrixContext): Promise<MatrixResult> {
  const groupId = str(payload, 'groupId');
  const ownerId = str(payload, 'ownerId');
  const shown =
    str(payload, 'to') === 'live' &&
    payload.firstLive === true &&
    payload.full === true &&
    payload.hidden !== true;
  if (!shown || !groupId || !ownerId || str(payload, 'placement') === 'marketplace') {
    return empty();
  }
  const group = await ctx.group(groupId);
  if (!group) return empty();
  const listingId = str(payload, 'listingId');
  const title = await titleOf(ctx, listingId);
  return {
    ...empty(),
    fanOuts: [
      {
        groupId,
        unitId: null,
        exclude: [ownerId],
        draft: {
          category: 'group_new_listings',
          type: 'listing.group.new',
          title: group.name,
          body: title ? `«${title}» vừa đăng trong nhóm.` : 'Có tin mới trong nhóm.',
          data: { groupId, listingId },
          groupId,
          alertable: true,
          personal: false,
          collapse: {
            key: `group:${groupId}:new-listings`,
            render: (count) => `Nhóm có ${count} tin mới.`,
            alertMinutes: 'notification.groupListingsAlertMinutes',
          },
        },
      },
    ],
  };
}

/**
 * Tin mới khớp một lượt tìm đã lưu (add-saved-searches): như N31, chỉ lần đầu tin hiện đầy đủ trên sàn chung. Gộp theo
 * lượt tìm; người đăng không nằm trong kết quả của `listing`.
 */
async function savedSearchMatch(payload: Payload, ctx: MatrixContext): Promise<MatrixResult> {
  const listingId = str(payload, 'listingId');
  const shown =
    str(payload, 'to') === 'live' &&
    payload.firstLive === true &&
    payload.full === true &&
    payload.hidden !== true &&
    str(payload, 'placement') === 'marketplace';
  if (!shown || !listingId) return empty();
  const matches = await ctx.savedSearchMatches(listingId);
  if (matches.length === 0) return empty();
  const title = await titleOf(ctx, listingId);
  return {
    ...empty(),
    drafts: matches.map((match) => ({
      recipients: [match.accountId],
      category: 'saved_searches',
      type: 'listing.saved_search.match',
      title: `Tìm kiếm «${match.q}»`,
      body: title ? `«${title}» khớp tìm kiếm của bạn.` : 'Có tin mới khớp tìm kiếm của bạn.',
      data: { savedSearchId: match.searchId, listingId },
      groupId: null,
      alertable: true,
      personal: false,
      collapse: {
        key: `saved-search:${match.searchId}`,
        render: (count) => `${count} tin mới khớp tìm kiếm của bạn.`,
        alertMinutes: 'notification.savedSearchAlertMinutes',
      },
    })),
  };
}

/**
 * N43, N44 (change notify-listing-decisions): câu nhắc chỉ nói tin đang chờ — câu của máy (chung ba phần với dấu hiệu
 * gian lận, các điều tự sửa được, mã tra cứu) chỉ nằm trong `detail` xem trong app, như người đăng thấy trên tin.
 */
const MACHINE_TEXT: Record<string, (title: string) => string> = {
  hold: (title) => `Tin «${title}» đang chờ người duyệt xem.`,
  recall: (title) => `Tin «${title}» tạm ngừng hiển thị để chờ người duyệt xem lại.`,
};

function machineDetail(notice: MachineNotice | null): string | null {
  if (!notice) return null;
  // Câu "chờ người duyệt" thường đã có sẵn thời gian chờ; câu chung của dấu hiệu gian lận thì chưa.
  const head =
    notice.kind === 'fraud' && notice.estimatedWait
      ? `${notice.message}. ${notice.estimatedWait}.`
      : `${notice.message}.`;
  return [
    head,
    ...notice.fixes.map((fix) => fix.message),
    ...(notice.lookupCode ? [`Mã tra cứu khi liên hệ hỗ trợ: ${notice.lookupCode}.`] : []),
  ].join('\n');
}

// N43 — máy giữ tin chờ người, N44 — máy rút tin đang hiện về chờ duyệt: người đăng được báo một lần, có nhắc.
async function machineHeld(payload: Payload, ctx: MatrixContext): Promise<MatrixResult> {
  const text = MACHINE_TEXT[str(payload, 'arrow') ?? ''];
  const ownerId = str(payload, 'ownerId');
  const listingId = str(payload, 'listingId');
  if (!text || !ownerId || !listingId || str(payload, 'to') !== 'pending') return empty();
  const [title, notice] = await Promise.all([
    titleOf(ctx, listingId),
    ctx.machineNotice(listingId),
  ]);
  return toOwners([ownerId], {
    type: `listing.machine.${str(payload, 'arrow')}`,
    title: title ?? 'Tin đăng của bạn',
    body: text(title ?? 'của bạn'),
    detail: machineDetail(notice),
    data: { listingId },
    groupId: str(payload, 'groupId'),
    alertable: true,
  });
}

const merged = (...results: MatrixResult[]): MatrixResult => ({
  drafts: results.flatMap((result) => result.drafts),
  fanOuts: results.flatMap((result) => result.fanOuts),
  hints: results.flatMap((result) => result.hints),
});

/**
 * Ma trận N31–N35, N37, N43, N44 (design add-listings mục 11, change notify-listing-decisions). Payload chỉ mang mã và
 * trạng thái; tên nhóm, tiêu đề tin, câu của máy hỏi qua cổng. Khoá / xoá tài khoản không có dòng nào: người đó không vào
 * được app.
 */
export const LISTING_MATRIX: Record<string, Handler> = {
  async [LISTING_EVENTS.stateChanged](payload: Payload, ctx: MatrixContext) {
    const [newInGroup, held, searched] = await Promise.all([
      groupNewListing(payload, ctx),
      machineHeld(payload, ctx),
      savedSearchMatch(payload, ctx),
    ]);
    return merged(newInGroup, held, searched);
  },

  // N32
  async [LISTING_EVENTS.hiddenChanged](payload, ctx) {
    const change = str(payload, 'change');
    const text = HIDDEN_TEXT[str(payload, 'reason') ?? ''];
    if (!text || (change !== 'added' && change !== 'removed')) return empty();
    const groupId = str(payload, 'groupId');
    const group = groupId ? await ctx.group(groupId) : null;
    if (groupId && !group) return empty();
    const body = text[change](group?.name ?? '');
    return toOwners(ids(payload, 'ownerIds'), {
      type: `listing.hidden.${change}`,
      title: group?.name ?? 'Tin đăng của bạn',
      body,
      data: { groupId, reason: str(payload, 'reason') },
      groupId,
      alertable: false,
      collapse: { key: `listings:hidden:${groupId ?? 'category'}`, render: () => body },
    });
  },

  // N33
  async [LISTING_EVENTS.detached](payload, ctx) {
    const text = DETACHED_TEXT[str(payload, 'reason') ?? ''];
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!text || !group) return empty();
    return toOwners(ids(payload, 'ownerIds'), {
      type: 'listing.detached',
      title: group.name,
      body: text(group.name, date(str(payload, 'moveUntil'))),
      data: { groupId: group.id, moveUntil: str(payload, 'moveUntil') },
      groupId: group.id,
      alertable: true,
    });
  },

  // N34
  async [LISTING_EVENTS.placementDowngraded](payload, ctx) {
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!group) return empty();
    const body = `Nhóm «${group.name}» chuyển sang riêng tư: tin "nhóm công khai" của bạn giờ chỉ thành viên nhóm thấy.`;
    return toOwners(ids(payload, 'ownerIds'), {
      type: 'listing.placement.downgraded',
      title: group.name,
      body,
      data: { groupId: group.id },
      groupId: group.id,
      alertable: false,
      collapse: { key: `listings:downgraded:${group.id}`, render: () => body },
    });
  },

  // N35
  async [LISTING_EVENTS.badgeRemoved](payload, ctx) {
    const ownerId = str(payload, 'ownerId');
    const group = await ctx.group(str(payload, 'groupId') ?? '');
    if (!ownerId || !group) return empty();
    const listingId = str(payload, 'listingId');
    const title = (await titleOf(ctx, listingId)) ?? 'tin của bạn';
    const body =
      str(payload, 'cause') === 'group'
        ? `Quản trị nhóm «${group.name}» đã gỡ huy hiệu nhóm khỏi tin «${title}».`
        : `Huy hiệu nhóm «${group.name}» đã được gỡ khỏi tin «${title}» vì bạn không còn quyền mang huy hiệu.`;
    return toOwners([ownerId], {
      type: 'listing.badge.removed',
      title: group.name,
      body,
      data: { groupId: group.id, listingId },
      groupId: group.id,
      alertable: false,
      collapse: { key: `listings:badge-removed:${group.id}`, render: () => body },
    });
  },

  // N37
  async [LISTING_EVENTS.expiryReminder](payload, ctx) {
    const ownerId = str(payload, 'ownerId');
    if (!ownerId) return empty();
    const listingId = str(payload, 'listingId');
    const title = await titleOf(ctx, listingId);
    return toOwners([ownerId], {
      type: 'listing.expiry.reminder',
      title: title ?? 'Tin sắp hết hạn',
      body: `Tin hết hạn ngày ${date(str(payload, 'expiresAt'))}. Gia hạn để tin tiếp tục hiện.`,
      data: { listingId, expiresAt: str(payload, 'expiresAt') },
      groupId: null,
      alertable: true,
    });
  },

  // N48 — tin hết hạn gần một năm, sắp bị xoá hẳn (add-data-retention): nhắc để còn kịp gia hạn.
  async [LISTING_EVENTS.purgeReminder](payload, ctx) {
    const ownerId = str(payload, 'ownerId');
    if (!ownerId) return empty();
    const listingId = str(payload, 'listingId');
    const title = await titleOf(ctx, listingId);
    const purgeAt = str(payload, 'purgeAt');
    return toOwners([ownerId], {
      type: 'listing.purge.reminder',
      title: title ?? 'Tin sắp bị xoá hẳn',
      body: `Tin đã hết hạn gần một năm và sẽ bị xoá hẳn ngày ${date(purgeAt)}. Gia hạn nếu bạn còn bán.`,
      data: { listingId, purgeAt },
      groupId: null,
      alertable: true,
    });
  },
};

export const LISTING_NOTICE_EVENTS = Object.keys(LISTING_MATRIX) as OutboxEventType[];
