import { NotFoundError } from '../../common/errors/app-error.js';
import { toPage, toSkipTake } from '../../common/schemas/pagination.js';
import type { AccountCardRow } from '../identity/identity.repository.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { TrustService } from '../trust/trust.service.js';
import type { AccountListQuery, OpsAccountCardDto, OpsAccountDto } from './ops.schema.js';

/** `identity` tìm và đọc thẻ, `trust` cho mức và cảnh cáo (design add-ops-account-directory mục 2). */
export interface AccountDirectoryDeps {
  identity: Pick<IdentityService, 'searchAccounts' | 'accountCard'>;
  trust: Pick<TrustService, 'tierOf' | 'struckAccounts' | 'strikePointsOf'>;
}

export interface OpsAccountPage {
  items: OpsAccountDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AccountDirectoryService {
  /** Danh bạ tài khoản chưa xoá, mới nhất trước (spec ops/account-directory). */
  listAccounts(query: AccountListQuery): Promise<OpsAccountPage>;
  /** Thẻ một tài khoản kèm điểm vi phạm; không có hay đã xoá → 404. */
  accountCard(id: string): Promise<OpsAccountCardDto>;
}

/** Cổng của `identity` đã loại tài khoản đã xoá; gặp `deleted` ở đây là lỗi hợp đồng, không phải dữ liệu. */
const listedStatus = (status: AccountCardRow['status']): OpsAccountDto['status'] => {
  if (status === 'deleted') throw new Error('Danh bạ không nhận tài khoản đã xoá');
  return status;
};

const toDto = (
  row: AccountCardRow,
  tier: OpsAccountDto['tier'],
  struck: boolean,
): OpsAccountDto => ({
  id: row.id,
  displayName: row.displayName,
  email: row.email,
  role: row.role,
  status: listedStatus(row.status),
  createdAt: row.createdAt.toISOString(),
  lockedAt: row.lockedAt?.toISOString() ?? null,
  lockedReason: row.lockedReason,
  tier,
  struck,
});

export function createAccountDirectoryService(deps: AccountDirectoryDeps): AccountDirectoryService {
  const enrich = async (rows: AccountCardRow[]): Promise<OpsAccountDto[]> => {
    const ids = rows.map((row) => row.id);
    const [tiers, struck] = await Promise.all([
      Promise.all(ids.map((id) => deps.trust.tierOf(id))),
      deps.trust.struckAccounts(ids),
    ]);
    return rows.map((row, i) => toDto(row, tiers[i] ?? 'T0', struck.has(row.id)));
  };

  return {
    async listAccounts(query) {
      const { rows, total } = await deps.identity.searchAccounts({
        q: query.q ?? null,
        status: query.status ?? null,
        ...toSkipTake(query),
      });
      return toPage(await enrich(rows), total, query);
    },

    async accountCard(id) {
      const row = await deps.identity.accountCard(id);
      if (!row) throw new NotFoundError('Không có tài khoản này');
      const [[dto], strikePoints] = await Promise.all([
        enrich([row]),
        deps.trust.strikePointsOf(id),
      ]);
      if (!dto) throw new NotFoundError('Không có tài khoản này');
      return { ...dto, strikePoints };
    },
  };
}
