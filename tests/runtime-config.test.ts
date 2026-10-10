import { describe, expect, it } from 'vitest';

import {
  RUNTIME_CONFIG_DEFAULTS,
  createStaticRuntimeConfig,
  type RuntimeConfigKey,
} from '../src/common/config/runtime-config.js';

describe('createStaticRuntimeConfig', () => {
  it('đọc đủ mọi khoá với đúng giá trị khởi đầu của TK 28', () => {
    const config = createStaticRuntimeConfig();
    for (const [key, value] of Object.entries(RUNTIME_CONFIG_DEFAULTS)) {
      expect(config.get(key as RuntimeConfigKey)).toBe(value);
    }
  });

  it('overrides thắng mặc định, các khoá khác giữ nguyên', () => {
    const config = createStaticRuntimeConfig({ 'identity.sessionCapUser': 2 });
    expect(config.get('identity.sessionCapUser')).toBe(2);
    expect(config.get('identity.sessionCapPrivileged')).toBe(3);
  });

  it('khoá lạ thì nổ, không trả undefined', () => {
    const config = createStaticRuntimeConfig();
    expect(() => config.get('identity.khongCo' as RuntimeConfigKey)).toThrow(/identity\.khongCo/);
  });
});
