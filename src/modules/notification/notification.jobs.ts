import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { NotificationService } from './notification.service.js';

export const NOTIFICATION_JOBS = {
  /** Theo sự kiện: đẩy những dòng có nhắc vừa ghi lên điện thoại (add-notifications, design mục 3). */
  push: 'notification.push',
  /** Mỗi 15 phút: đọc biên nhận Expo, quên token máy đã gỡ app. */
  pushReceipts: 'notification.push-receipts',
} as const satisfies Record<string, JobName>;

const RECEIPTS_CRON = '*/15 * * * *';

export interface PushJob {
  notificationIds: string[];
}

export async function registerNotificationJobs(
  jobs: Jobs,
  notification: NotificationService,
): Promise<void> {
  await jobs.work<PushJob>(NOTIFICATION_JOBS.push, async (data) => {
    await notification.pushNotifications(data);
  });
  await jobs.schedule(NOTIFICATION_JOBS.pushReceipts, RECEIPTS_CRON, async () => {
    const result = await notification.pushReceipts();
    if (result.checked > 0) logger.info(result, NOTIFICATION_JOBS.pushReceipts);
  });
}
