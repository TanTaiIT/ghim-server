/**
 * Sổ đăng ký con số (TK 28): mọi khoá hợp lệ của bảng con số có phiên bản, kiểu và giá trị khởi
 * đầu. Phiên bản 1 trong DB = toàn bộ bảng này; `platform` chỉ nhận thay đổi cho khoá có ở đây.
 * Tên khoá là hợp đồng với mọi change sau: `<phần>.<tên>`, không bịa tên mới ngoài sổ. Con số của
 * danh mục (trần giá, giá tham chiếu, mức rủi ro) KHÔNG ở đây — chúng là phiên bản cài đặt của
 * từng danh mục. Hạn lưu (TK 25) và điểm dấu hiệu (TK 14) thêm vào khi phần đó được xây.
 *
 * Đổi một giá trị khởi đầu là đổi TK trước (CLAUDE.md luật 19).
 */
export type ConfigKind = 'int' | 'percent';

export interface ConfigKeySpec {
  kind: ConfigKind;
  initial: number;
  /** Nhóm trong bảng TK 28, để bàn vận hành xếp cột. */
  group: string;
}

const int = (initial: number, group: string): ConfigKeySpec => ({ kind: 'int', initial, group });
const percent = (initial: number, group: string): ConfigKeySpec => ({
  kind: 'percent',
  initial,
  group,
});

const ACCOUNT = 'Tài khoản';
const DEVICE = 'Thiết bị';
const TRUST = 'Mức tin cậy';
const QUOTA = 'Hạn mức';
const SCREENING = 'Máy duyệt';
const REVIEW = 'Hàng chờ';
const POSTCHECK = 'Hậu kiểm';
const STRIKE = 'Gậy';
const REPORT = 'Báo cáo';
const LISTING = 'Tin đăng';
const GROUP = 'Nhóm';
const NOTIFICATION = 'Thông báo';

export const CONFIG_KEYS = {
  // Tài khoản
  'identity.codeTtlMinutes': int(10, ACCOUNT),
  'identity.codeMaxAttempts': int(5, ACCOUNT),
  'identity.resendCooldownSeconds': int(60, ACCOUNT),
  'identity.unverifiedPurgeDays': int(7, ACCOUNT),
  'identity.sessionCapUser': int(20, ACCOUNT),
  'identity.sessionCapPrivileged': int(3, ACCOUNT),
  'identity.sessionIdleDays': int(30, ACCOUNT),
  'identity.accessTokenMinutes': int(15, ACCOUNT),
  'identity.passwordMinLength': int(8, ACCOUNT),
  'identity.passwordMaxLength': int(128, ACCOUNT),
  'identity.emailChangeIntervalDays': int(30, ACCOUNT),
  'identity.deletedEmailHoldDays': int(90, ACCOUNT),
  'identity.authRateLimitPerMinute': int(10, ACCOUNT),
  // Thiết bị
  'identity.deviceSlots': int(3, DEVICE),
  'identity.deviceWindowDays': int(90, DEVICE),
  'device.dataRetentionDays': int(180, DEVICE),
  // Mức tin cậy
  'trust.t1MinDays': int(7, TRUST),
  'trust.t1MinCleanListings': int(1, TRUST),
  'trust.t2MinDays': int(30, TRUST),
  'trust.t2MinCleanListings': int(5, TRUST),
  'trust.t3MinDays': int(90, TRUST),
  'trust.t3MinCleanListings': int(20, TRUST),
  'trust.maxCleanPer7Days': int(3, TRUST),
  'trust.soldCountsCleanAfterDays': int(2, TRUST),
  // Hạn mức T0 / T1 / T2 / T3
  'quota.liveListingsT0': int(10, QUOTA),
  'quota.liveListingsT1': int(20, QUOTA),
  'quota.liveListingsT2': int(50, QUOTA),
  'quota.liveListingsT3': int(100, QUOTA),
  'quota.submitsPerHourT0': int(3, QUOTA),
  'quota.submitsPerHourT1': int(5, QUOTA),
  'quota.submitsPerHourT2': int(10, QUOTA),
  'quota.submitsPerHourT3': int(20, QUOTA),
  'quota.newConversationsPerDayT0': int(10, QUOTA),
  'quota.newConversationsPerDayT1': int(20, QUOTA),
  'quota.newConversationsPerDayT2': int(50, QUOTA),
  'quota.newConversationsPerDayT3': int(100, QUOTA),
  'quota.outsiderLiveListingsPerGroup': int(2, QUOTA),
  // Máy duyệt
  'screening.mediumBandFrom': int(30, SCREENING),
  'screening.highBandFrom': int(60, SCREENING),
  'screening.abnormalPriceMinSamples': int(30, SCREENING),
  'screening.highValueReferencePriceFrom': int(2_000_000, SCREENING),
  'screening.burstSubmitsPerDayWarn': int(10, SCREENING),
  'screening.burstSubmitsPerDayHold': int(30, SCREENING),
  'screening.imageResultTimeoutMinutes': int(5, SCREENING),
  'screening.hardGateProbesPer24h': int(3, SCREENING),
  'screening.hardGateCooldownHours': int(24, SCREENING),
  'screening.bannedPhraseTrialDays': int(7, SCREENING),
  // Hàng chờ
  'review.machineHoldHours': int(24, REVIEW),
  'review.reportHours': int(72, REVIEW),
  'review.appealDays': int(7, REVIEW),
  'review.machineRestrictionHours': int(72, REVIEW),
  'review.groupEscalationHours': int(72, REVIEW),
  'review.sampleDays': int(7, REVIEW),
  'review.claimMinutes': int(10, REVIEW),
  'review.remindMasterHours': int(72, REVIEW),
  // Hậu kiểm
  'postcheck.borderlineSamplePercent': percent(100, POSTCHECK),
  'postcheck.newAccountSamplePercent': percent(20, POSTCHECK),
  'postcheck.otherSamplePercent': percent(5, POSTCHECK),
  'postcheck.reviewerPassSamplePercent': percent(5, POSTCHECK),
  'postcheck.alertBelowCompletionPercent': percent(80, POSTCHECK),
  // Gậy
  'strike.normalPoints': int(1, STRIKE),
  'strike.normalDays': int(90, STRIKE),
  'strike.severePoints': int(2, STRIKE),
  'strike.severeDays': int(180, STRIKE),
  'strike.postingLockFromPoints': int(3, STRIKE),
  'strike.appealDays': int(14, STRIKE),
  'strike.seriousAppealDays': int(30, STRIKE),
  'strike.permanentReviewYears': int(2, STRIKE),
  // Báo cáo — hai ngưỡng điểm âm của TK (−3, −6) lưu dưới dạng độ lớn, vì bảng chỉ nhận số không âm
  'report.perHour': int(10, REPORT),
  'report.autoHideReporters': int(3, REPORT),
  'report.autoHideDevices': int(3, REPORT),
  'report.autoHideMinTier': int(1, REPORT),
  'report.autoHideWindowHours': int(24, REPORT),
  'report.scoreIgnoreAutoHideBelowMinus': int(3, REPORT),
  'report.scoreLoseRightBelowMinus': int(6, REPORT),
  'report.loseRightDays': int(30, REPORT),
  // Tin đăng
  'listing.visibleDays': int(30, LISTING),
  'listing.remindBeforeDays': int(7, LISTING),
  'listing.renewWindowDays': int(7, LISTING),
  'listing.renewExtendDays': int(30, LISTING),
  'listing.maxImages': int(6, LISTING),
  // Nhóm
  'group.applicationExpiresDays': int(21, GROUP),
  'group.reapplyWaitDays': int(7, GROUP),
  'group.maxPendingApplications': int(3, GROUP),
  'group.inviteExpiresDays': int(14, GROUP),
  'group.ownershipTransferExpiresDays': int(14, GROUP),
  'group.codeLength': int(6, GROUP),
  'group.ownerlessMaxDays': int(30, GROUP),
  'group.announcementsPerDay': int(5, GROUP),
  'group.announcementMaxLength': int(1000, GROUP),
  // Thông báo
  'notification.collapseAlertMinutes': int(30, NOTIFICATION),
} as const satisfies Record<string, ConfigKeySpec>;

export type RuntimeConfigKey = keyof typeof CONFIG_KEYS;

export const CONFIG_KEY_LIST = Object.keys(CONFIG_KEYS) as RuntimeConfigKey[];

export function isConfigKey(key: string): key is RuntimeConfigKey {
  return Object.hasOwn(CONFIG_KEYS, key);
}

const PERCENT_MAX = 100;

/** Luật của spec config-versions: đúng kiểu, không âm, phần trăm 0–100. `null` = hợp lệ. */
export function configValueIssue(key: RuntimeConfigKey, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'phải là số nguyên';
  if (value < 0) return 'không được âm';
  if (CONFIG_KEYS[key].kind === 'percent' && value > PERCENT_MAX) return 'phần trăm tối đa 100';
  return null;
}
