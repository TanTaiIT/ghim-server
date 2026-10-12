import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

/** Bộ biến tối thiểu để schema qua được — các ca dưới chỉ đổi đúng thứ đang thử. */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ghim_dev',
  JWT_SECRET: 'jwt-secret-thu-du-ba-muoi-hai-ky-tu-0001',
  IDENTITY_HASH_KEY: 'identity-hash-key-thu-du-ba-muoi-hai-ky-tu-01',
  // 32 byte 0 — đủ dài, không phải khoá thật.
  SECRETS_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  SMTP_URL: 'smtp://ghim:ghim@localhost:1025',
  MAIL_FROM: 'Ghim <no-reply@ghim.test>',
  STORAGE_URL: 'http://ghim:ghim-dev-secret@localhost:9100/ghim-dev',
};

/** Bộ biến production hợp lệ: DB không mang hậu tố, SMTP, Google, CORS cụ thể, proxy trong mạng nội bộ. */
const production = {
  ...base,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db:5432/ghim',
  GOOGLE_CLIENT_IDS: 'ios-id.apps.googleusercontent.com',
  CORS_ORIGIN: 'https://ops.ghim.vn',
  TRUST_PROXY: 'uniquelocal',
};

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định khi thiếu biến tuỳ chọn', () => {
    const result = loadEnv(base);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3100);
    expect(result.CORS_ORIGIN).toBe('*');
  });

  it('pool có mặc định; giá trị không dương bị từ chối', () => {
    expect(loadEnv(base)).toMatchObject({ DATABASE_POOL_MAX: 10, JOBS_POOL_MAX: 5 });
    expect(loadEnv({ ...base, DATABASE_POOL_MAX: '20' }).DATABASE_POOL_MAX).toBe(20);
    expect(() => loadEnv({ ...base, DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/);
    expect(() => loadEnv({ ...base, JOBS_POOL_MAX: 'nhieu' })).toThrow(/JOBS_POOL_MAX/);
  });

  it('production cho mọi nguồn gọi API (CORS *) → từ chối, nêu CORS_ORIGIN', () => {
    expect(() => loadEnv({ ...production, CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN/);
  });

  it('production không khai TRUST_PROXY → từ chối, nêu TRUST_PROXY', () => {
    const { TRUST_PROXY: _omitted, ...withoutProxy } = production;
    expect(() => loadEnv(withoutProxy)).toThrow(/TRUST_PROXY/);
  });

  it('TRUST_PROXY=true và số hop bị từ chối ở mọi môi trường', () => {
    expect(() => loadEnv({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ ...production, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ ...production, TRUST_PROXY: '1' })).toThrow(/TRUST_PROXY/);
  });

  it('production khai đủ → khởi động bình thường', () => {
    expect(loadEnv(production)).toMatchObject({
      NODE_ENV: 'production',
      TRUST_PROXY: 'uniquelocal',
    });
  });

  it('ép kiểu PORT từ string sang number', () => {
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('báo lỗi khi giá trị không hợp lệ', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/Biến môi trường không hợp lệ/);
  });

  /*
   * Ca quan trọng nhất của file này: thiếu chuỗi kết nối là app phải CHẾT LÚC KHỞI ĐỘNG, không
   * phải chết ở request đầu tiên chạm DB — lúc đó health check đã báo xanh và traffic đã vào.
   */
  it('thiếu DATABASE_URL thì hỏng ngay, không im lặng', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});

const url = (name: string) => `postgresql://user:pass@db.example.com:5432/${name}`;

describe('loadEnv — mỗi môi trường một DB (tên DB mang hậu tố môi trường)', () => {
  it.each([
    ['development', 'ghim_dev'],
    ['test', 'ghim_test'],
    ['production', 'ghim_prod'],
    ['production', 'ghim'],
  ])('%s + %s → chạy được', (NODE_ENV, name) => {
    // Production còn đòi CORS cụ thể và proxy tường minh — khai đủ để ca này chỉ thử tên DB.
    const source = {
      ...base,
      NODE_ENV,
      DATABASE_URL: url(name),
      GOOGLE_CLIENT_IDS: 'ios-id',
      CORS_ORIGIN: 'https://ops.ghim.vn',
      TRUST_PROXY: 'uniquelocal',
    };
    expect(loadEnv(source).DATABASE_URL).toBe(url(name));
  });

  it.each([
    ['production', 'ghim_dev'],
    ['production', 'ghim_test'],
    ['development', 'ghim'],
    ['development', 'ghim_test'],
    ['test', 'ghim_dev'],
  ])('%s + %s → hỏng ngay ở khởi động', (NODE_ENV, name) => {
    expect(() => loadEnv({ ...base, NODE_ENV, DATABASE_URL: url(name) })).toThrow(/DATABASE_URL/);
  });

  it('bỏ trống NODE_ENV = development, nên cũng đòi DB `_dev`', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: url('ghim_prod') })).toThrow(/_dev/);
  });
});

describe('loadEnv — khoá của identity', () => {
  it.each(['JWT_SECRET', 'IDENTITY_HASH_KEY', 'SECRETS_ENCRYPTION_KEY', 'MAIL_FROM'])(
    'thiếu %s thì hỏng ngay ở khởi động',
    (name) => {
      const { [name]: _omitted, ...rest } = base as Record<string, string>;
      expect(() => loadEnv(rest)).toThrow(new RegExp(name));
    },
  );

  it.each(['JWT_SECRET', 'IDENTITY_HASH_KEY'])('%s ngắn hơn 32 ký tự thì từ chối', (name) => {
    expect(() => loadEnv({ ...base, [name]: 'x'.repeat(31) })).toThrow(new RegExp(name));
  });

  it('SECRETS_ENCRYPTION_KEY phải đúng 32 byte base64', () => {
    const sixteenBytes = 'AAAAAAAAAAAAAAAAAAAAAA==';
    expect(() => loadEnv({ ...base, SECRETS_ENCRYPTION_KEY: sixteenBytes })).toThrow(/32 byte/);
    expect(() => loadEnv({ ...base, SECRETS_ENCRYPTION_KEY: 'không phải base64!' })).toThrow(
      /SECRETS_ENCRYPTION_KEY/,
    );
  });

  it('JWT_SECRET và IDENTITY_HASH_KEY không được trùng nhau', () => {
    expect(() => loadEnv({ ...base, IDENTITY_HASH_KEY: base.JWT_SECRET })).toThrow(
      /IDENTITY_HASH_KEY/,
    );
  });

  it('SMTP_URL chỉ được bỏ trống ở test', () => {
    const { SMTP_URL: _omitted, ...withoutSmtp } = base;
    expect(() => loadEnv(withoutSmtp)).toThrow(/SMTP_URL/);
    expect(
      loadEnv({ ...withoutSmtp, NODE_ENV: 'test', DATABASE_URL: url('ghim_test') }).SMTP_URL,
    ).toBeUndefined();
  });

  it('STORAGE_URL bắt buộc ở mọi môi trường và phải mang khoá cùng tên bucket', () => {
    const { STORAGE_URL: _omitted, ...withoutStorage } = base;
    expect(() => loadEnv(withoutStorage)).toThrow(/STORAGE_URL/);
    expect(() => loadEnv({ ...base, STORAGE_URL: 'http://localhost:9100/ghim-dev' })).toThrow(
      /khoá truy cập/,
    );
    expect(() => loadEnv({ ...base, STORAGE_URL: 'http://ghim:x@localhost:9100/' })).toThrow(
      /bucket/,
    );
  });

  it('bản tạm của tin đăng: mặc định T1 / máy tắt; production bật máy duyệt tạm thì từ chối khởi động', () => {
    expect(loadEnv(base)).toMatchObject({ DEV_TRUST_TIER: 'T1', DEV_MACHINE_REVIEW: 'off' });
    expect(loadEnv({ ...base, DEV_MACHINE_REVIEW: 'pass_full' }).DEV_MACHINE_REVIEW).toBe(
      'pass_full',
    );
    expect(() => loadEnv({ ...base, DEV_TRUST_TIER: 'T9' })).toThrow(/DEV_TRUST_TIER/);
    expect(() => loadEnv({ ...production, DEV_MACHINE_REVIEW: 'hold' })).toThrow(
      /DEV_MACHINE_REVIEW/,
    );
    expect(loadEnv({ ...production, DEV_MACHINE_REVIEW: 'off' }).DEV_MACHINE_REVIEW).toBe('off');
  });

  it('GOOGLE_CLIENT_IDS tách thành danh sách, trống ở dev được, production thì không', () => {
    expect(loadEnv(base).GOOGLE_CLIENT_IDS).toEqual([]);
    expect(
      loadEnv({ ...base, GOOGLE_CLIENT_IDS: ' ios-id , android-id ' }).GOOGLE_CLIENT_IDS,
    ).toEqual(['ios-id', 'android-id']);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', DATABASE_URL: url('ghim') })).toThrow(
      /GOOGLE_CLIENT_IDS/,
    );
  });

  it('DISPOSABLE_DOMAINS_URL có mặc định là danh sách công khai', () => {
    expect(loadEnv(base).DISPOSABLE_DOMAINS_URL).toMatch(/^https:\/\/.+domains\.txt$/);
  });
});
