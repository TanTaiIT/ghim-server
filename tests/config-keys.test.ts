import { describe, expect, it } from 'vitest';

import {
  CONFIG_KEYS,
  CONFIG_KEY_LIST,
  configRelationIssues,
  configValueIssue,
  isConfigKey,
  type RuntimeConfigKey,
} from '../src/common/config/config-keys.js';
import { RUNTIME_CONFIG_DEFAULTS } from '../src/common/config/runtime-config.js';

/* Sổ đăng ký là hợp đồng với mọi change sau: đủ nhóm TK 28, mỗi khoá đúng dạng và có giá trị hợp lệ. */
describe('CONFIG_KEYS', () => {
  it('phủ đủ 15 nhóm: 14 của bảng TK 28 (Nhắn tin từ add-activity-status) và hạn lưu (TK 25, add-data-retention)', () => {
    const groups = new Set(Object.values(CONFIG_KEYS).map((spec) => spec.group));
    expect([...groups].toSorted()).toEqual(
      [
        'Tài khoản',
        'Thiết bị',
        'Mức tin cậy',
        'Hạn mức',
        'Máy duyệt',
        'Hàng chờ',
        'Hậu kiểm',
        'Cảnh cáo',
        'Báo cáo',
        'Tin đăng',
        'Nhóm',
        'Thông báo',
        'Nhắn tin',
        'Ảnh',
        'Hạn lưu',
      ].toSorted(),
    );
  });

  it('mọi khoá dạng <phần>.<tên>; giá trị khởi đầu nằm trong khoảng và giữ mọi ràng buộc giữa khoá', () => {
    for (const key of CONFIG_KEY_LIST) {
      expect(key).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
      expect(configValueIssue(key, CONFIG_KEYS[key].initial)).toBeNull();
    }
    expect(CONFIG_KEY_LIST.length).toBeGreaterThan(80);
    expect(configRelationIssues(RUNTIME_CONFIG_DEFAULTS)).toEqual([]);
  });

  it('kiểm giá trị: số nguyên trong khoảng của khoá; khoá lạ không hợp lệ', () => {
    expect(configValueIssue('quota.liveListingsT1', -5)).toBe('phải từ 1 tới 2.147.483.647');
    expect(configValueIssue('quota.liveListingsT1', 1.5)).toMatch(/nguyên/);
    expect(configValueIssue('postcheck.newAccountSamplePercent', 120)).toBe('phải từ 0 tới 100');
    expect(configValueIssue('postcheck.newAccountSamplePercent', 100)).toBeNull();
    expect(isConfigKey('identity.codeTtlMinutes')).toBe(true);
    expect(isConfigKey('khong.co')).toBe(false);
  });
});

describe('khoảng hợp lệ (design fix-audit-security mục 5)', () => {
  it.each<[RuntimeConfigKey, number, boolean]>([
    // Sàn mặc định 1: 0 làm hỏng hệ thống.
    ['identity.sessionIdleDays', 0, false],
    ['identity.authRateLimitPerMinute', 0, false],
    ['screening.abnormalPriceFactor', 0, false],
    // 0 có nghĩa "tắt / không chờ".
    ['group.reapplyWaitDays', 0, true],
    ['identity.deviceWindowDays', 0, true],
    ['screening.newAccountDays', 0, true],
    // Cố ý không nhận 0.
    ['identity.deletedEmailHoldDays', 0, false],
    ['identity.resendCooldownSeconds', 0, false],
    ['identity.emailChangeIntervalDays', 0, false],
    ['notification.collapseAlertMinutes', 0, false],
    ['notification.groupListingsAlertMinutes', 0, false],
    ['device.dataRetentionDays', 0, false],
    // Thời lượng tối đa 100 năm.
    ['listing.visibleDays', 36_500, true],
    ['listing.visibleDays', 36_501, false],
    ['review.machineHoldHours', 876_001, false],
    ['strike.permanentReviewYears', 101, false],
    // Trần riêng.
    ['identity.accessTokenMinutes', 35_791, true],
    ['identity.accessTokenMinutes', 35_792, false],
    ['identity.passwordMaxLength', 1025, false],
    ['screening.highBandFrom', 1001, false],
    ['screening.abnormalPricePercentile', 50, true],
    ['screening.abnormalPricePercentile', 51, false],
    ['screening.imageDuplicateMaxDistance', 0, true],
    // Chất lượng ảnh (add-image-quality-checks): cạnh ngắn 100–2000 điểm ảnh, độ sáng thang 0–255.
    ['screening.imageMinShortSide', 99, false],
    ['screening.imageMinShortSide', 2001, false],
    ['screening.imageMinSharpness', 0, true],
    ['screening.imageMaxBrightness', 256, false],
    ['screening.imageDuplicateMaxDistance', 5, false],
    ['screening.textScoreTimeoutMs', 2_147_483_648, false],
    ['listing.maxImages', 51, false],
    ['group.codeLength', 5, false],
    ['group.codeLength', 21, false],
    ['group.announcementMaxLength', 10_001, false],
    // Lần cuối hoạt động chỉ hiện trong 1–30 ngày (add-activity-status).
    ['messaging.activityVisibleDays', 0, false],
    ['messaging.activityVisibleDays', 30, true],
    ['messaging.activityVisibleDays', 31, false],
    ['media.maxImageBytes', 2_147_483_648, false],
    ['media.uploadGrantMinutes', 10_081, false],
    ['media.viewUrlMinutes', 5041, false],
    ['report.autoHideMinTier', 0, true],
    ['report.autoHideMinTier', 4, false],
  ])('%s = %d → hợp lệ: %s', (key, value, valid) => {
    expect(configValueIssue(key, value) === null).toBe(valid);
  });
});

const issuesWith = (changes: Partial<Record<RuntimeConfigKey, number>>) =>
  configRelationIssues({ ...RUNTIME_CONFIG_DEFAULTS, ...changes });

describe('ràng buộc giữa khoá', () => {
  it.each<[Partial<Record<RuntimeConfigKey, number>>, string]>([
    [{ 'screening.mediumBandFrom': 60 }, 'screening.mediumBandFrom'],
    [{ 'identity.passwordMinLength': 129 }, 'identity.passwordMinLength'],
    [{ 'trust.t2MinDays': 100 }, 'trust.t1MinDays'],
    [{ 'trust.t1MinCleanListings': 6 }, 'trust.t1MinCleanListings'],
    [{ 'listing.remindBeforeDays': 30 }, 'listing.remindBeforeDays'],
    [{ 'listing.renewWindowDays': 30 }, 'listing.renewWindowDays'],
    [{ 'media.uploadGrantMinutes': 2881 }, 'media.uploadGrantMinutes'],
    [{ 'identity.resendCooldownSeconds': 601 }, 'identity.resendCooldownSeconds'],
    [{ 'identity.codeTtlMinutes': 10_080 }, 'identity.codeTtlMinutes'],
    [{ 'screening.imageMinBrightness': 235 }, 'screening.imageMinBrightness'],
  ])('%o → lỗi nêu %s', (changes, key) => {
    const issues = issuesWith(changes);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(key);
  });

  it('đổi một khoá mà vẫn giữ thứ tự → không lỗi', () => {
    expect(issuesWith({ 'listing.visibleDays': 60, 'listing.remindBeforeDays': 30 })).toEqual([]);
  });
});
