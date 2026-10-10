import { describe, expect, it } from 'vitest';

import {
  CONFIG_KEYS,
  CONFIG_KEY_LIST,
  configValueIssue,
  isConfigKey,
} from '../src/common/config/config-keys.js';

/* Sổ đăng ký là hợp đồng với mọi change sau: đủ nhóm TK 28, mỗi khoá đúng dạng và có giá trị hợp lệ. */
describe('CONFIG_KEYS', () => {
  it('phủ đủ 11 nhóm của bảng TK 28', () => {
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
        'Gậy',
        'Báo cáo',
        'Tin đăng',
        'Nhóm',
      ].toSorted(),
    );
  });

  it('mọi khoá dạng <phần>.<tên> và giá trị khởi đầu hợp lệ theo chính luật của bảng', () => {
    for (const key of CONFIG_KEY_LIST) {
      expect(key).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
      expect(configValueIssue(key, CONFIG_KEYS[key].initial)).toBeNull();
    }
    expect(CONFIG_KEY_LIST.length).toBeGreaterThan(80);
  });

  it('kiểm giá trị: số nguyên, không âm, phần trăm tối đa 100; khoá lạ không hợp lệ', () => {
    expect(configValueIssue('quota.liveListingsT1', -5)).toMatch(/âm/);
    expect(configValueIssue('quota.liveListingsT1', 1.5)).toMatch(/nguyên/);
    expect(configValueIssue('postcheck.newAccountSamplePercent', 120)).toMatch(/100/);
    expect(configValueIssue('postcheck.newAccountSamplePercent', 100)).toBeNull();
    expect(isConfigKey('identity.codeTtlMinutes')).toBe(true);
    expect(isConfigKey('khong.co')).toBe(false);
  });
});
