/**
 * Mỗi môi trường một DB riêng, và TÊN DB nói nó thuộc môi trường nào:
 *
 *   development → `…_dev`     test → `…_test`     production → không mang hai hậu tố trên
 *
 * Vì sao chặn bằng tên: dán nhầm chuỗi kết nối production vào `.env.development` thì mọi thứ vẫn
 * "chạy được" — cho tới lúc `pnpm db:reset` hay bộ test DB (xoá sạch bảng trước mỗi ca) chạy trên
 * dữ liệu thật của người dùng. Kiểm tên là thứ duy nhất phân biệt được hai chuỗi kết nối cùng hình
 * dạng mà không cần biết hạ tầng nằm ở đâu.
 *
 * Dùng chung cho app (`env.ts`) và Prisma CLI (`prisma.config.ts`) — CLI không nạp `env.ts`, mà
 * lệnh nguy hiểm nhất (`migrate reset`) lại chạy qua CLI. Vì thế file này không import gì.
 */
const SUFFIX = { development: '_dev', test: '_test' } as const;

export function databaseEnvironmentIssue(
  nodeEnv: string | undefined,
  databaseUrl: string | undefined,
): string | null {
  if (!databaseUrl) return null;

  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    // Chuỗi hỏng là việc của validate URL, không phải của chốt này.
    return null;
  }

  const env = nodeEnv ?? 'development';
  if (env === 'production') {
    return Object.values(SUFFIX).some((suffix) => name.endsWith(suffix))
      ? `NODE_ENV=production nhưng DATABASE_URL trỏ vào DB "${name}" của dev/test.`
      : null;
  }
  if (env === 'development' || env === 'test') {
    const suffix = SUFFIX[env];
    return name.endsWith(suffix)
      ? null
      : `NODE_ENV=${env} chỉ được dùng DB có tên kết thúc bằng "${suffix}" (đang là "${name}").`;
  }
  return null;
}
