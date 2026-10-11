import type { OutboxEventInput, OutboxPayload } from '../../common/outbox/outbox.js';

/**
 * Sự kiện `group` phát vào outbox (design mục 12). Payload chỉ mang mã và trạng thái — văn bản là việc của
 * `notification`; bên nghe phải chịu được nhận trùng.
 */
export const GROUP_EVENTS = {
  ownerOffered: 'group.owner.offered',
  ownerOfferDecided: 'group.owner.offer_decided',
  ownerChanged: 'group.owner.changed',
  ownerlessStarted: 'group.ownerless.started',
  ownerlessResolved: 'group.ownerless.resolved',
  locked: 'group.state.locked',
  unlocked: 'group.state.unlocked',
  closed: 'group.state.closed',
  modeChanged: 'group.mode.changed',
  privatizationStarted: 'group.privatization.started',
  privatizationCompleted: 'group.privatization.completed',
  badgeRightsChanged: 'group.badge.rights_changed',
  memberJoined: 'group.member.joined',
  memberLeft: 'group.member.left',
  memberUnitChanged: 'group.member.unit_changed',
  moderatorChanged: 'group.moderator.changed',
  joinRequested: 'group.join_request.created',
  joinRequestDecided: 'group.join_request.decided',
  invited: 'group.invitation.created',
  invitationDecided: 'group.invitation.decided',
  rosterMatched: 'group.roster.matched',
  banned: 'group.ban.created',
  unbanned: 'group.ban.lifted',
  announcementPosted: 'group.announcement.posted',
} as const;

export type GroupEventType = (typeof GROUP_EVENTS)[keyof typeof GROUP_EVENTS];

export const groupEvent = (type: GroupEventType, payload: OutboxPayload): OutboxEventInput => ({
  type,
  payload,
});
