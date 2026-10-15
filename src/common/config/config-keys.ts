/**
 * Sổ đăng ký con số (TK 28): mọi khoá hợp lệ của bảng con số có phiên bản, kiểu và giá trị khởi
 * đầu. Phiên bản 1 trong DB = toàn bộ bảng này; `platform` chỉ nhận thay đổi cho khoá có ở đây.
 * Tên khoá là hợp đồng với mọi change sau: `<phần>.<tên>`, không bịa tên mới ngoài sổ. Con số của
 * danh mục (trần giá, giá tham chiếu, mức rủi ro) KHÔNG ở đây — chúng là phiên bản cài đặt của
 * từng danh mục. Hạn lưu (TK 25) và điểm dấu hiệu (TK 14) thêm vào khi phần đó được xây.
 *
 * Đổi một giá trị khởi đầu là đổi TK trước (CLAUDE.md luật 19).
 *
 * Mỗi khoá có khoảng hợp lệ (spec config-versions, design `fix-audit-security` mục 5): master gõ nhầm một con số là
 * đủ làm hệ thống hỏng — hạn 0 thì phiên, mã, quyền tải chết ngay lúc cấp; hạn mức 0 chặn hết; chia cho 0 làm job
 * đổ. Sàn mặc định 1; khoá nhận 0 khi 0 có nghĩa "tắt / không chờ" và code chạy đúng với nó. Trần riêng ghi ở khoá,
 * kèm chỗ code hay DB ép nó.
 */
export type ConfigKind = 'int' | 'percent';

export interface ConfigKeySpec {
  kind: ConfigKind;
  initial: number;
  /** Nhóm trong bảng TK 28, để bàn vận hành xếp cột. */
  group: string;
  min: number;
  max: number;
}

interface Bounds {
  min?: number;
  max?: number;
}

/** Cột `INTEGER` (cỡ ảnh) và trần của `setTimeout` (hạn chấm chữ, hẹn giờ cắt socket). */
const INT_MAX = 2_147_483_647;
/** Schema đăng ký, đăng nhập nhận mật khẩu tối đa 1024 ký tự. */
const PASSWORD_INPUT_MAX = 1024;
/** Bằng khoảng của dải theo danh mục (`bandsBodySchema`). */
const BAND_MAX = 1000;

const bounded =
  (kind: ConfigKind, defaults: Required<Bounds>) =>
  (initial: number, group: string, bounds: Bounds = {}): ConfigKeySpec => ({
    kind,
    initial,
    group,
    min: bounds.min ?? defaults.min,
    max: bounds.max ?? defaults.max,
  });

/**
 * Thời lượng trần 100 năm theo đơn vị của khoá: gõ thừa số 0 nữa thì mốc tính ra vượt khoảng của `Date` hay của
 * Postgres (trước năm 4713 TCN), và job dùng nó đổ.
 */
const duration = (perCentury: number) =>
  bounded('int', { min: 1, max: Math.min(perCentury, INT_MAX) });

const int = bounded('int', { min: 1, max: INT_MAX });
const percent = bounded('percent', { min: 0, max: 100 });
const seconds = duration(3_153_600_000);
const minutes = duration(52_560_000);
const hours = duration(876_000);
const days = duration(36_500);
const years = duration(100);

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
const MEDIA = 'Ảnh';

export const CONFIG_KEYS = {
  // Tài khoản
  'identity.codeTtlMinutes': minutes(10, ACCOUNT),
  'identity.codeMaxAttempts': int(5, ACCOUNT),
  'identity.resendCooldownSeconds': seconds(60, ACCOUNT),
  'identity.unverifiedPurgeDays': days(7, ACCOUNT),
  'identity.sessionCapUser': int(20, ACCOUNT),
  'identity.sessionCapPrivileged': int(3, ACCOUNT),
  'identity.sessionIdleDays': days(30, ACCOUNT),
  // Token vừa bị thay gửi lại trong khoảng này là tab khác / lượt thử lại, không phải token lộ (fix-audit-identity,
  // T11). Rộng hơn 5 phút là bỏ lỡ dấu hiệu token lộ quá lâu.
  'identity.refreshGraceSeconds': seconds(30, ACCOUNT, { max: 300 }),
  // Realtime hẹn giờ cắt socket theo hạn token: quá 2³¹−1 ms thì `setTimeout` bắn sau 1 ms.
  'identity.accessTokenMinutes': minutes(15, ACCOUNT, { max: 35_791 }),
  'identity.passwordMinLength': int(8, ACCOUNT, { max: PASSWORD_INPUT_MAX }),
  'identity.passwordMaxLength': int(128, ACCOUNT, { max: PASSWORD_INPUT_MAX }),
  'identity.emailChangeIntervalDays': days(30, ACCOUNT),
  'identity.deletedEmailHoldDays': days(90, ACCOUNT),
  'identity.authRateLimitPerMinute': int(10, ACCOUNT),
  // Thiết bị
  'identity.deviceSlots': int(3, DEVICE),
  'identity.deviceWindowDays': days(90, DEVICE, { min: 0 }),
  'device.dataRetentionDays': days(180, DEVICE),
  // Mức tin cậy
  'trust.t1MinDays': days(7, TRUST, { min: 0 }),
  'trust.t1MinCleanListings': int(1, TRUST, { min: 0 }),
  'trust.t2MinDays': days(30, TRUST, { min: 0 }),
  'trust.t2MinCleanListings': int(5, TRUST, { min: 0 }),
  'trust.t3MinDays': days(90, TRUST, { min: 0 }),
  'trust.t3MinCleanListings': int(20, TRUST, { min: 0 }),
  'trust.maxCleanPer7Days': int(3, TRUST),
  'trust.soldCountsCleanAfterDays': days(2, TRUST, { min: 0 }),
  // Tin sạch theo lối hiển thị: cộng dồn thời gian được thấy (design add-trust-tiers câu 3, 10).
  'trust.cleanShownDays': days(7, TRUST),
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
  'quota.outsiderLiveListingsPerGroup': int(2, QUOTA, { min: 0 }),
  // Máy duyệt
  'screening.mediumBandFrom': int(30, SCREENING, { max: BAND_MAX }),
  'screening.highBandFrom': int(60, SCREENING, { max: BAND_MAX }),
  'screening.abnormalPriceMinSamples': int(30, SCREENING),
  'screening.highValueReferencePriceFrom': int(2_000_000, SCREENING, { min: 0 }),
  'screening.burstSubmitsPerDayWarn': int(10, SCREENING),
  'screening.burstSubmitsPerDayHold': int(30, SCREENING),
  'screening.imageResultTimeoutMinutes': minutes(5, SCREENING),
  'screening.hardGateProbesPer24h': int(3, SCREENING),
  'screening.hardGateCooldownHours': hours(24, SCREENING, { min: 0 }),
  'screening.bannedPhraseTrialDays': days(7, SCREENING, { min: 0 }),
  // Design add-screening mục 13: trần chấm chữ trong lượt gửi, các ngưỡng dấu hiệu, độ lệch dHash coi là trùng.
  'screening.textScoreTimeoutMs': int(2000, SCREENING),
  'screening.newAccountDays': days(3, SCREENING, { min: 0 }),
  // Trên 50 thì cận dưới vượt cận trên — vi phạm CHECK của `category_price_stats`.
  'screening.abnormalPricePercentile': int(10, SCREENING, { min: 0, max: 50 }),
  'screening.abnormalPriceFactor': int(2, SCREENING),
  'screening.priceWindowDays': days(90, SCREENING, { min: 0 }),
  'screening.ownDuplicateDays': days(30, SCREENING, { min: 0 }),
  'screening.heldManyCount': int(3, SCREENING),
  'screening.heldManyDays': days(7, SCREENING, { min: 0 }),
  // dHash chia 5 dải, ứng viên tìm bằng dải trùng: lệch từ 5 bit trở lên không bao giờ thấy.
  'screening.imageDuplicateMaxDistance': int(4, SCREENING, { min: 0, max: 4 }),
  // Hàng chờ
  'review.machineHoldHours': hours(24, REVIEW),
  'review.reportHours': hours(72, REVIEW),
  'review.appealDays': days(7, REVIEW),
  'review.machineRestrictionHours': hours(72, REVIEW),
  'review.groupEscalationHours': hours(72, REVIEW),
  'review.sampleDays': days(7, REVIEW),
  'review.claimMinutes': minutes(10, REVIEW),
  'review.remindMasterHours': hours(72, REVIEW, { min: 0 }),
  // Hậu kiểm
  'postcheck.borderlineSamplePercent': percent(100, POSTCHECK),
  'postcheck.newAccountSamplePercent': percent(20, POSTCHECK),
  'postcheck.otherSamplePercent': percent(5, POSTCHECK),
  'postcheck.reviewerPassSamplePercent': percent(5, POSTCHECK),
  'postcheck.alertBelowCompletionPercent': percent(80, POSTCHECK),
  // Gậy
  'strike.normalPoints': int(1, STRIKE),
  'strike.normalDays': days(90, STRIKE),
  'strike.severePoints': int(2, STRIKE),
  'strike.severeDays': days(180, STRIKE),
  'strike.postingLockFromPoints': int(3, STRIKE),
  'strike.appealDays': days(14, STRIKE),
  'strike.seriousAppealDays': days(30, STRIKE),
  'strike.permanentReviewYears': years(2, STRIKE),
  // Báo cáo — hai ngưỡng điểm âm của TK (−3, −6) lưu dưới dạng độ lớn, vì bảng chỉ nhận số không âm
  'report.perHour': int(10, REPORT),
  'report.autoHideReporters': int(3, REPORT),
  'report.autoHideDevices': int(3, REPORT),
  'report.autoHideMinTier': int(1, REPORT, { min: 0, max: 3 }),
  'report.autoHideWindowHours': hours(24, REPORT),
  'report.scoreIgnoreAutoHideBelowMinus': int(3, REPORT),
  'report.scoreLoseRightBelowMinus': int(6, REPORT),
  'report.loseRightDays': days(30, REPORT),
  // Tin đăng
  'listing.visibleDays': days(30, LISTING),
  'listing.remindBeforeDays': days(7, LISTING, { min: 0 }),
  'listing.renewWindowDays': days(7, LISTING, { min: 0 }),
  'listing.renewExtendDays': days(30, LISTING),
  // Schema tin nhận tối đa 50 ảnh; tin gửi cần ít nhất 1 ảnh (CHECK).
  'listing.maxImages': int(6, LISTING, { max: 50 }),
  'listing.moveToMarketplaceDays': days(30, LISTING, { min: 0 }),
  // Nhóm
  'group.applicationExpiresDays': days(21, GROUP),
  'group.reapplyWaitDays': days(7, GROUP, { min: 0 }),
  'group.maxPendingApplications': int(3, GROUP),
  'group.inviteExpiresDays': days(14, GROUP),
  'group.ownershipTransferExpiresDays': days(14, GROUP),
  // Schema nhận mã tối đa 20 ký tự. Sàn 6: 32⁶ ≈ 1 tỉ mã, nhiều triệu nhóm vẫn hiếm trùng (chỉ thử lại 5 lần).
  'group.codeLength': int(6, GROUP, { min: 6, max: 20 }),
  'group.ownerlessMaxDays': days(30, GROUP, { min: 0 }),
  'group.announcementsPerDay': int(5, GROUP, { min: 0 }),
  // Schema thông báo nhóm nhận tối đa 10 000 ký tự.
  'group.announcementMaxLength': int(1000, GROUP, { max: 10_000 }),
  // Thông báo
  'notification.collapseAlertMinutes': minutes(30, NOTIFICATION),
  // N31: tin mới trong nhóm nhắc tối đa một lần mỗi 2 giờ mỗi nhóm (design add-listings mục 11).
  'notification.groupListingsAlertMinutes': minutes(120, NOTIFICATION),
  // N40–N42 báo master: TK 16 "nhắc lại mỗi ngày" — cảnh báo của dòng gộp không bật lại sớm hơn (fix-audit-review, T9).
  'notification.reviewAlertMinutes': minutes(1440, NOTIFICATION),
  // Ảnh
  'media.maxImageBytes': int(5_242_880, MEDIA),
  // Chữ ký S3 (SigV4) sống tối đa 7 ngày.
  'media.uploadGrantMinutes': minutes(15, MEDIA, { max: 10_080 }),
  'media.uploadGrantsPerHour': int(120, MEDIA),
  'media.unconfirmedHours': hours(48, MEDIA),
  // Bộ nối S3 ký đường xem gấp đôi số phút, mà chữ ký sống tối đa 7 ngày.
  'media.viewUrlMinutes': minutes(60, MEDIA, { max: 5040 }),
} as const satisfies Record<string, ConfigKeySpec>;

export type RuntimeConfigKey = keyof typeof CONFIG_KEYS;

export const CONFIG_KEY_LIST = Object.keys(CONFIG_KEYS) as RuntimeConfigKey[];

export function isConfigKey(key: string): key is RuntimeConfigKey {
  return Object.hasOwn(CONFIG_KEYS, key);
}

const formatNumber = (value: number): string => value.toLocaleString('vi-VN');

/** Luật của spec config-versions: số nguyên trong khoảng hợp lệ của khoá. `null` = hợp lệ. */
export function configValueIssue(key: RuntimeConfigKey, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'phải là số nguyên';
  const { min, max } = CONFIG_KEYS[key];
  if (value < min || value > max) return `phải từ ${formatNumber(min)} tới ${formatNumber(max)}`;
  return null;
}

type ConfigValues = Readonly<Record<RuntimeConfigKey, number>>;

/** Mỗi ràng buộc là một chỗ code đã giả định thứ tự giữa hai con số (design `fix-audit-security` mục 5). */
const RELATIONS: { holds: (values: ConfigValues) => boolean; issue: string }[] = [
  {
    holds: (v) => v['screening.mediumBandFrom'] < v['screening.highBandFrom'],
    issue:
      'screening.mediumBandFrom phải nhỏ hơn screening.highBandFrom — không thì dải Vừa không bao giờ xảy ra',
  },
  {
    holds: (v) => v['identity.passwordMinLength'] <= v['identity.passwordMaxLength'],
    issue:
      'identity.passwordMinLength không được lớn hơn identity.passwordMaxLength — mọi mật khẩu sẽ bị từ chối',
  },
  {
    holds: (v) =>
      v['trust.t1MinDays'] <= v['trust.t2MinDays'] && v['trust.t2MinDays'] <= v['trust.t3MinDays'],
    issue: 'trust.t1MinDays ≤ trust.t2MinDays ≤ trust.t3MinDays — không thì tài khoản nhảy bậc',
  },
  {
    holds: (v) =>
      v['trust.t1MinCleanListings'] <= v['trust.t2MinCleanListings'] &&
      v['trust.t2MinCleanListings'] <= v['trust.t3MinCleanListings'],
    issue:
      'trust.t1MinCleanListings ≤ trust.t2MinCleanListings ≤ trust.t3MinCleanListings — không thì tài khoản nhảy bậc',
  },
  {
    holds: (v) => v['listing.remindBeforeDays'] < v['listing.visibleDays'],
    issue:
      'listing.remindBeforeDays phải nhỏ hơn listing.visibleDays — không thì tin vừa lên đã bị nhắc hết hạn',
  },
  {
    holds: (v) =>
      v['listing.renewWindowDays'] < v['listing.renewExtendDays'] &&
      v['listing.renewWindowDays'] < v['listing.visibleDays'],
    issue:
      'listing.renewWindowDays phải nhỏ hơn listing.renewExtendDays và listing.visibleDays — không thì gia hạn nối nhau vô tận',
  },
  {
    holds: (v) => v['media.uploadGrantMinutes'] <= v['media.unconfirmedHours'] * 60,
    issue:
      'media.uploadGrantMinutes không được dài hơn media.unconfirmedHours — job dọn sẽ xoá ảnh khi quyền tải còn sống',
  },
  {
    holds: (v) => v['identity.resendCooldownSeconds'] <= v['identity.codeTtlMinutes'] * 60,
    issue:
      'identity.resendCooldownSeconds không được dài hơn identity.codeTtlMinutes — mã hết hạn mà chưa xin lại được',
  },
  {
    holds: (v) => v['identity.codeTtlMinutes'] < v['identity.unverifiedPurgeDays'] * 1440,
    issue:
      'identity.codeTtlMinutes phải ngắn hơn identity.unverifiedPurgeDays — đăng ký bị dọn khi mã còn sống',
  },
];

/** Ràng buộc giữa các khoá, kiểm trên cả bộ con số sau khi ghép thay đổi. Rỗng = hợp lệ. */
export function configRelationIssues(values: ConfigValues): string[] {
  return RELATIONS.filter((relation) => !relation.holds(values)).map((relation) => relation.issue);
}
