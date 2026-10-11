import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { GroupService } from './group.service.js';

export const GROUP_JOBS = {
  expirePending: 'group.expire-pending',
  ownerlessTimeout: 'group.ownerless-timeout',
} as const satisfies Record<string, JobName>;

/**
 * Mỗi giờ, không mỗi ngày như TK 26: chạy theo ngày thì nhóm thiếu chủ có thể quá 30 ngày gần trọn một ngày nữa, trái
 * cam kết 24. Hạn vẫn được kiểm lúc thao tác, nên job trễ chỉ làm thông báo "hết hạn" tới muộn, không làm sai kết quả.
 */
const EXPIRE_CRON = '5 * * * *';
const OWNERLESS_CRON = '15 * * * *';

export async function registerGroupJobs(jobs: Jobs, group: GroupService): Promise<void> {
  await jobs.schedule(GROUP_JOBS.expirePending, EXPIRE_CRON, async () => {
    const expired = await group.expireDue();
    if (expired.requests + expired.invitations + expired.offers > 0) {
      logger.info({ ...expired }, 'group.expire-pending');
    }
  });
  await jobs.schedule(GROUP_JOBS.ownerlessTimeout, OWNERLESS_CRON, async () => {
    const locked = await group.lockOwnerlessTimedOut();
    if (locked.length > 0) logger.info({ locked: locked.length }, 'group.ownerless-timeout');
  });
}
