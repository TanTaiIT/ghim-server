import { z } from 'zod';

import { paginationQuerySchema } from '../../common/schemas/pagination.js';
import { emailSchema } from '../identity/identity.schema.js';

/** Tuple của các enum nhóm trong schema.prisma (CLAUDE.md luật 5). */
export const GROUP_KINDS = ['school', 'company', 'community', 'other'] as const;
export const GROUP_STATES = [
  'pending_owner',
  'active',
  'going_private',
  'ownerless',
  'locked',
  'closed',
] as const;
export const GROUP_MODES = [
  'public_open',
  'public_review',
  'private_code',
  'private_invite',
] as const;
export const GROUP_BOARD_STYLES = ['list', 'grid'] as const;
export const GROUP_ROLES = ['member', 'moderator', 'owner'] as const;
export const GROUP_JOIN_PATHS = ['joined', 'approved', 'invited', 'roster', 'assigned'] as const;
export const GROUP_JOIN_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'withdrawn',
  'cancelled',
] as const;
export const GROUP_OWNER_OFFER_KINDS = ['assignment', 'transfer'] as const;

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 1000;
export const UNIT_NAME_MAX = 60;
export const ROSTER_BATCH_MAX = 500;
/**
 * Trần kỹ thuật chặn body khổng lồ, không phải luật: độ dài thật là `group.announcementMaxLength` của bảng con số,
 * service kiểm theo ký tự ở lượt gửi — master nâng con số thì không phải sửa schema.
 */
const ANNOUNCEMENT_BODY_CEILING = 10_000;

const nameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX);
const descriptionSchema = z.string().trim().max(GROUP_DESCRIPTION_MAX);

export const groupIdParamsSchema = z.object({ groupId: z.uuid() });
export const groupMemberParamsSchema = z.object({ groupId: z.uuid(), accountId: z.uuid() });
export const groupUnitParamsSchema = z.object({ groupId: z.uuid(), unitId: z.uuid() });
export const idParamsSchema = z.object({ id: z.uuid() });

// ── BODY / QUERY ──────────────────────────────────────────────────────────────────────────────────

export const createGroupBodySchema = z
  .object({
    name: nameSchema,
    kind: z.enum(GROUP_KINDS),
    mode: z.enum(GROUP_MODES),
    description: descriptionSchema.optional(),
  })
  .strict();

export const groupSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(GROUP_NAME_MAX).optional(),
});

export const opsGroupListQuerySchema = paginationQuerySchema.extend({
  state: z.enum(GROUP_STATES).optional(),
});

/** Gửi đúng thứ muốn đổi; mọi khoá đều tuỳ chọn nhưng phải có ít nhất một. */
export const groupSettingsBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    mode: z.enum(GROUP_MODES).optional(),
    allowOutsiders: z.boolean().optional(),
    showNameOnMarketplace: z.boolean().optional(),
    boardStyle: z.enum(GROUP_BOARD_STYLES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Cần ít nhất một cài đặt' });

export const joinBodySchema = z
  .object({ code: z.string().trim().min(1).max(20).optional() })
  .strict();
export const lookupCodeBodySchema = z.object({ code: z.string().trim().min(1).max(20) }).strict();
export const lockBodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const accountTargetBodySchema = z.object({ accountId: z.uuid() }).strict();
export const inviteBodySchema = z
  .object({ email: emailSchema, unitId: z.uuid().optional() })
  .strict();
export const rosterBodySchema = z
  .object({
    entries: z
      .array(z.object({ email: emailSchema, unitId: z.uuid().optional() }).strict())
      .min(1)
      .max(ROSTER_BATCH_MAX),
  })
  .strict();
export const rosterRemoveBodySchema = z.object({ email: emailSchema }).strict();
export const memberUnitBodySchema = z.object({ unitId: z.uuid().nullable() }).strict();
export const moderatorBodySchema = z.object({ unitId: z.uuid().nullable() }).strict();
export const unitBodySchema = z
  .object({ name: z.string().trim().min(1).max(UNIT_NAME_MAX) })
  .strict();
export const decideBodySchema = z.object({ approve: z.boolean() }).strict();
export const membersQuerySchema = paginationQuerySchema.extend({ unitId: z.uuid().optional() });

// ── DTO ───────────────────────────────────────────────────────────────────────────────────────────

export const groupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(GROUP_KINDS),
  mode: z.enum(GROUP_MODES),
  state: z.enum(GROUP_STATES),
  description: z.string().nullable(),
  memberCount: z.number().int(),
});

export const membershipSchema = z.object({
  role: z.enum(GROUP_ROLES),
  unitId: z.uuid().nullable(),
  moderatorUnitId: z.uuid().nullable(),
  joinedVia: z.enum(GROUP_JOIN_PATHS),
  joinedAt: z.iso.datetime(),
  badgeEligible: z.boolean(),
});

export const unitSchema = z.object({ id: z.uuid(), name: z.string() });

/**
 * Hồ sơ đầy đủ — cho thành viên, khách xem nhóm công khai, và master. Mã nhóm và lý do khoá chỉ có khi người xem
 * là chủ nhóm, điều hành viên hay master; người ngoài nhóm riêng tư chỉ nhận `groupNameOnlySchema`.
 */
export const groupProfileSchema = groupSummarySchema.extend({
  visibility: z.literal('full'),
  boardStyle: z.enum(GROUP_BOARD_STYLES),
  allowOutsiders: z.boolean(),
  showNameOnMarketplace: z.boolean(),
  code: z.string().nullable(),
  lockedReason: z.string().nullable(),
  units: z.array(unitSchema),
  membership: membershipSchema.nullable(),
});

export const groupNameOnlySchema = z.object({
  visibility: z.literal('name_only'),
  id: z.uuid(),
  name: z.string(),
});

export const groupViewSchema = z.discriminatedUnion('visibility', [
  groupProfileSchema,
  groupNameOnlySchema,
]);

export const myGroupSchema = groupSummarySchema.extend({ membership: membershipSchema });

export const memberSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string(),
  role: z.enum(GROUP_ROLES),
  unitId: z.uuid().nullable(),
  moderatorUnitId: z.uuid().nullable(),
  joinedVia: z.enum(GROUP_JOIN_PATHS),
  joinedAt: z.iso.datetime(),
});

export const joinRequestSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  accountId: z.uuid(),
  displayName: z.string(),
  status: z.enum(GROUP_JOIN_REQUEST_STATUSES),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/**
 * Lời mời đang chờ cho người quản lý nhóm (fix-audit-group): chỉ email đã che, không có mã tài khoản — dòng của email chưa
 * có tài khoản giống hệt dòng thật (TK 10). `id` để thu hồi.
 */
export const pendingInvitationSchema = z.object({
  id: z.uuid(),
  emailHint: z.string(),
  unitId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/** Người đang bị cấm khỏi nhóm — để gỡ cấm trên app. */
export const bannedMemberSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string(),
  bannedAt: z.iso.datetime(),
  bannedBy: z.uuid(),
});

export const joinResultSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('member'), membership: membershipSchema }),
  z.object({ result: z.literal('request'), request: joinRequestSchema }),
]);

export const invitationSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  groupName: z.string(),
  unitId: z.uuid().nullable(),
  expiresAt: z.iso.datetime(),
});

/** Lời mời đang chờ và nhóm có tên mình trong danh sách lớp — app gộp làm một danh sách "nhóm mời bạn". */
export const myInvitationsSchema = z.object({
  invitations: z.array(invitationSchema),
  rosters: z.array(
    z.object({ groupId: z.uuid(), groupName: z.string(), unitId: z.uuid().nullable() }),
  ),
});

export const ownerOfferSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  groupName: z.string(),
  kind: z.enum(GROUP_OWNER_OFFER_KINDS),
  expiresAt: z.iso.datetime(),
});

export const badgeSchema = z.object({ groupId: z.uuid(), groupName: z.string() });

export const announcementBodySchema = z
  .object({
    body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_CEILING),
    unitId: z.uuid().optional(),
  })
  .strict();

export const announcementSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  unitId: z.uuid().nullable(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const rosterResultSchema = z.object({ added: z.number().int() });

export type CreateGroupInput = z.infer<typeof createGroupBodySchema>;
export type GroupSettingsInput = z.infer<typeof groupSettingsBodySchema>;
export type GroupSummaryDto = z.infer<typeof groupSummarySchema>;
export type GroupProfileDto = z.infer<typeof groupProfileSchema>;
export type GroupViewDto = z.infer<typeof groupViewSchema>;
export type MembershipDto = z.infer<typeof membershipSchema>;
export type MyGroupDto = z.infer<typeof myGroupSchema>;
export type MemberDto = z.infer<typeof memberSchema>;
export type JoinRequestDto = z.infer<typeof joinRequestSchema>;
export type PendingInvitationDto = z.infer<typeof pendingInvitationSchema>;
export type BannedMemberDto = z.infer<typeof bannedMemberSchema>;
export type JoinResultDto = z.infer<typeof joinResultSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export type MyInvitationsDto = z.infer<typeof myInvitationsSchema>;
export type OwnerOfferDto = z.infer<typeof ownerOfferSchema>;
export type BadgeDto = z.infer<typeof badgeSchema>;
export type AnnouncementDto = z.infer<typeof announcementSchema>;
export type UnitDto = z.infer<typeof unitSchema>;
