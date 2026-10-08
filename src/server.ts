import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

/** Quá hạn này thì thoát cưỡng bức — không để một request treo giữ container sống mãi. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const app = await buildApp();

  let shuttingDown = false;

  /*
   * Tắt theo thứ tự: HTTP trước, DB sau.
   *
   * `app.close()` ngừng nhận kết nối mới và đợi request đang chạy xong. Đóng Prisma trước thì
   * đúng những request đang dở dang sẽ vấp lỗi kết nối — biến một lượt deploy êm thành một loạt
   * 500 cho người dùng đang thao tác.
   */
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Nhận tín hiệu tắt, đang đóng...');
    const force = setTimeout(() => {
      logger.error('Tắt quá hạn, thoát cưỡng bức');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    try {
      await app.close();
      await prisma.$disconnect();
      logger.info('Đã đóng sạch');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Lỗi khi đóng');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason: String(reason) }, 'Unhandled rejection');
    void shutdown('SIGTERM');
  });

  process.on('uncaughtException', (error: Error) => {
    // Thoát NGAY, không đóng êm: state của tiến trình đã không còn đáng tin sau một exception
    // lọt tới đây, và cố chạy tiếp là rủi ro ghi sai dữ liệu.
    logger.error({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Không khởi động được');
  process.exit(1);
});
