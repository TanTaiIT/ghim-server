import { randomUUID } from 'node:crypto';

import type { AuditLog } from '@prisma/client';

import type { AuditEntry } from '../../src/common/audit/audit.js';

/** Một dòng nhật ký hợp lệ cho test chỉ cần repository nhận được dòng; `actorId` là UUID vì cột là uuid. */
export const TEST_AUDIT: AuditEntry = {
  actorId: '00000000-0000-7000-8000-0000000000aa',
  actorRole: 'master',
  action: 'test.audit.entry',
  targetType: 'test',
  targetId: 'test',
};

/**
 * Bản giả của bảng `audit_log`. Ở production mọi module ghi chung MỘT bảng và `platform` đọc nó;
 * repository giả của từng module nhận chung một sổ này thì `/ops/audit` thấy dòng `identity` ghi,
 * đúng như DB thật.
 */
export interface FakeAuditLog {
  readonly rows: AuditLog[];
  append(entry: AuditEntry, at: Date): void;
}

export function createFakeAuditLog(): FakeAuditLog {
  const rows: AuditLog[] = [];
  return {
    rows,
    append(entry, at) {
      rows.push({
        id: randomUUID(),
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        reason: entry.reason ?? null,
        details: entry.details ?? null,
        createdAt: at,
      });
    },
  };
}
