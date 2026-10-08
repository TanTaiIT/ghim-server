import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

/** Bộ biến tối thiểu để schema qua được — các ca dưới chỉ đổi đúng thứ đang thử. */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ghim_dev',
};

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định khi thiếu biến tuỳ chọn', () => {
    const result = loadEnv(base);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3100);
    expect(result.CORS_ORIGIN).toBe('*');
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
    expect(loadEnv({ NODE_ENV, DATABASE_URL: url(name) }).DATABASE_URL).toBe(url(name));
  });

  it.each([
    ['production', 'ghim_dev'],
    ['production', 'ghim_test'],
    ['development', 'ghim'],
    ['development', 'ghim_test'],
    ['test', 'ghim_dev'],
  ])('%s + %s → hỏng ngay ở khởi động', (NODE_ENV, name) => {
    expect(() => loadEnv({ NODE_ENV, DATABASE_URL: url(name) })).toThrow(/DATABASE_URL/);
  });

  it('bỏ trống NODE_ENV = development, nên cũng đòi DB `_dev`', () => {
    expect(() => loadEnv({ DATABASE_URL: url('ghim_prod') })).toThrow(/_dev/);
  });
});
