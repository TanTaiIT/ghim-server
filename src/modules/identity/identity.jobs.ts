import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import type { SecretBox } from '../../common/crypto/secrets.js';
import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { Mailer } from '../../lib/mailer.js';
import { type NoticeKind, renderCodeMail, renderNoticeMail } from './identity.mail.js';
import type { IdentityRepository } from './identity.repository.js';
import type { CodePurpose } from './identity.schema.js';

export const IDENTITY_JOBS = {
  sendMail: 'identity.send-mail',
  sendNotice: 'identity.send-notice',
  purgeUnverified: 'identity.purge-unverified',
  purgeExpired: 'identity.purge-expired',
  refreshDisposableDomains: 'identity.refresh-disposable-domains',
} as const satisfies Record<string, JobName>;

/** Hằng ngày lúc 3 giờ sáng và thứ Hai 4 giờ sáng (giờ Việt Nam): lúc ít người đăng tin nhất. */
const PURGE_UNVERIFIED_CRON = '0 3 * * *';
const PURGE_EXPIRED_CRON = '30 3 * * *';
const REFRESH_DISPOSABLE_CRON = '0 4 * * 1';
/** Phiên đã thu hồi hay hết hạn còn nằm lại 30 ngày để người dùng thấy "bị đăng xuất lúc nào" nếu cần tra. */
const INACTIVE_SESSION_RETENTION_DAYS = 30;
const SEND_MAIL_RETRY_LIMIT = 3;
const FETCH_TIMEOUT_MS = 30_000;
const DAY_MS = 86_400_000;

/**
 * Mã đi trong payload dưới dạng ĐÃ MÃ HOÁ: pg-boss giữ dòng việc (kể cả đã xong) một thời gian
 * trong bảng của nó, và luật là DB không bao giờ chứa mã thô — bảng `verification_codes` chỉ có
 * HMAC thì bảng việc cũng không được hơn.
 */
export interface SendMailJob {
  to: string;
  purpose: CodePurpose;
  sealedCode: string;
  ttlMinutes: number;
}

/** Thư báo không mang mã. `newEmail` đã che bớt trước khi vào bảng việc. */
export interface SendNoticeJob {
  to: string;
  kind: NoticeKind;
  newEmail: string;
}

export interface IdentityJobDeps {
  repository: IdentityRepository;
  mailer: Mailer;
  secrets: SecretBox;
  config: RuntimeConfig;
  clock: () => Date;
  disposableDomainsUrl: string;
  /** Tiêm được để test việc cập nhật không chạm mạng. */
  fetchText?: (url: string) => Promise<string>;
}

const DOMAIN_LINE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Một miền mỗi dòng; bỏ dòng trống, chú thích và dòng không phải miền — nguồn công khai, không tin mù. */
export function parseDomainList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim().toLowerCase();
    if (line && !line.startsWith('#') && DOMAIN_LINE.test(line)) seen.add(line);
  }
  return [...seen];
}

async function fetchTextDefault(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export function createSendMailHandler({
  mailer,
  secrets,
}: Pick<IdentityJobDeps, 'mailer' | 'secrets'>): (job: SendMailJob) => Promise<void> {
  return async (job) => {
    const mail = renderCodeMail(job.purpose, secrets.open(job.sealedCode), job.ttlMinutes);
    await mailer.send({ to: job.to, ...mail });
  };
}

export function createSendNoticeHandler({
  mailer,
}: Pick<IdentityJobDeps, 'mailer'>): (job: SendNoticeJob) => Promise<void> {
  return async (job) => {
    await mailer.send({ to: job.to, ...renderNoticeMail(job.kind, { newEmail: job.newEmail }) });
  };
}

export function createPurgeUnverifiedHandler({
  repository,
  config,
  clock,
}: Pick<IdentityJobDeps, 'repository' | 'config' | 'clock'>): () => Promise<void> {
  return async () => {
    const days = config.get('identity.unverifiedPurgeDays');
    const count = await repository.deleteUnverifiedAccountsBefore(
      new Date(clock().getTime() - days * DAY_MS),
    );
    logger.info({ count }, 'Đã xoá đăng ký dở dang quá hạn');
  };
}

/** Mã đã hết hạn hay đã tiêu không còn giá trị gì; phiên chết giữ 30 ngày rồi xoá. */
export function createPurgeExpiredHandler({
  repository,
  clock,
}: Pick<IdentityJobDeps, 'repository' | 'clock'>): () => Promise<void> {
  return async () => {
    const now = clock();
    const codes = await repository.deleteCodesExpiredBefore(now);
    const sessions = await repository.deleteSessionsInactiveBefore(
      new Date(now.getTime() - INACTIVE_SESSION_RETENTION_DAYS * DAY_MS),
    );
    logger.info({ codes, sessions }, 'Đã dọn mã và phiên hết hạn');
  };
}

/**
 * Chỉ THÊM: `seedDisposableDomains` bỏ qua mọi miền đã có dòng — kể cả bia mộ master đã bỏ —
 * nên lượt cập nhật không hồi sinh và không xoá gì (spec registration). Tải lỗi hay rỗng thì
 * giữ nguyên danh sách: một lần nguồn hỏng không được làm mất lớp chặn.
 */
export function createRefreshDisposableDomainsHandler({
  repository,
  clock,
  disposableDomainsUrl,
  fetchText = fetchTextDefault,
}: Pick<
  IdentityJobDeps,
  'repository' | 'clock' | 'disposableDomainsUrl' | 'fetchText'
>): () => Promise<void> {
  return async () => {
    let text: string;
    try {
      text = await fetchText(disposableDomainsUrl);
    } catch (error) {
      logger.warn({ err: error }, 'Không tải được danh sách miền dùng một lần, giữ danh sách cũ');
      return;
    }
    const domains = parseDomainList(text);
    if (domains.length === 0) {
      logger.warn('Danh sách miền dùng một lần tải về rỗng, giữ danh sách cũ');
      return;
    }
    const added = await repository.seedDisposableDomains(domains, clock());
    logger.info({ fetched: domains.length, added }, 'Đã cập nhật danh sách miền dùng một lần');
  };
}

export async function registerIdentityJobs(jobs: Jobs, deps: IdentityJobDeps): Promise<void> {
  await jobs.work<SendMailJob>(IDENTITY_JOBS.sendMail, createSendMailHandler(deps), {
    retryLimit: SEND_MAIL_RETRY_LIMIT,
  });
  await jobs.work<SendNoticeJob>(IDENTITY_JOBS.sendNotice, createSendNoticeHandler(deps), {
    retryLimit: SEND_MAIL_RETRY_LIMIT,
  });
  await jobs.schedule(
    IDENTITY_JOBS.purgeUnverified,
    PURGE_UNVERIFIED_CRON,
    createPurgeUnverifiedHandler(deps),
  );
  await jobs.schedule(
    IDENTITY_JOBS.purgeExpired,
    PURGE_EXPIRED_CRON,
    createPurgeExpiredHandler(deps),
  );
  await jobs.schedule(
    IDENTITY_JOBS.refreshDisposableDomains,
    REFRESH_DISPOSABLE_CRON,
    createRefreshDisposableDomainsHandler(deps),
  );
}
