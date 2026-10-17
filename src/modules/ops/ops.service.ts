import type { JobSummary } from '../../lib/jobs.js';
import { createEvidenceHold } from './evidence-hold.service.js';
import type { JobRun } from './ops.repository.js';
import type { JobRunDto, JobRunsQuery } from './ops.schema.js';
import {
  createRetentionService,
  type RetentionDeps,
  type RetentionService,
} from './retention.service.js';

export type OpsServiceDeps = RetentionDeps;

/** Vận hành (TK 25, 26; đợt 7): dọn dữ liệu theo hạn lưu với tạm giữ bằng chứng, sổ kết quả việc nền. */
export interface OpsService extends RetentionService {
  /** Các lượt việc theo lịch gần nhất cho bàn vận hành — master xem việc nào mới làm được một phần hay hỏng. */
  listRuns(query: JobRunsQuery): Promise<JobRunDto[]>;
}

const toJobRunDto = (row: JobRun): JobRunDto => ({
  id: row.id,
  name: row.name,
  status: row.status,
  startedAt: row.startedAt.toISOString(),
  finishedAt: row.finishedAt.toISOString(),
  summary: (row.summary ?? {}) as JobSummary,
  error: row.error,
});

export function createOpsService(deps: OpsServiceDeps): OpsService {
  const hold = createEvidenceHold(deps);
  return {
    ...createRetentionService(deps, hold),
    async listRuns(query) {
      return (await deps.repository.listRuns(query)).map(toJobRunDto);
    },
  };
}
