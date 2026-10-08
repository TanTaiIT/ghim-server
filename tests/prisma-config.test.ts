import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * Chốt chặn của Prisma CLI nằm trong `prisma.config.ts`, thứ chỉ chạy khi gọi CLI thật — nên test
 * gọi đúng CLI. Cổng 1 không có gì lắng nghe: lệnh nào lọt qua chốt sẽ hỏng vì không nối được DB,
 * với câu lỗi KHÁC câu của chốt, nên test không thể xanh nhầm.
 *
 * Gọi thẳng `node …/prisma/build/index.js` như `tests/db-global-setup.ts`: chạy như nhau trên
 * Windows và Linux mà không cần shell.
 */
function prismaCli(nodeEnv: string, database: string, ...args: string[]) {
  const { NODE_ENV: _nodeEnv, DATABASE_URL: _url, ...rest } = process.env;
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    env: {
      ...rest,
      NODE_ENV: nodeEnv,
      DATABASE_URL: `postgresql://ghim:ghim@127.0.0.1:1/${database}`,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('prisma.config.ts — chốt chặn của CLI', () => {
  it.each([
    ['migrate', 'reset', '--force'],
    ['migrate', 'dev'],
    ['db', 'push'],
  ])(
    'production từ chối "prisma %s %s" trước khi chạm DB',
    (...args) => {
      const { status, output } = prismaCli('production', 'ghim', ...args);

      expect(status).not.toBe(0);
      expect(output).toContain(`Không chạy "prisma ${args[0]} ${args[1]}"`);
    },
    60_000,
  );

  it('development trỏ vào DB không mang hậu tố `_dev` thì CLI từ chối', () => {
    const { status, output } = prismaCli('development', 'ghim', 'migrate', 'deploy');

    expect(status).not.toBe(0);
    expect(output).toContain('_dev');
  }, 60_000);
});
