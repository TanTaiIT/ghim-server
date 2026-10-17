import { NotFoundError } from '../../../common/errors/app-error.js';
import { normalizeLookupCode } from '../../../common/crypto/lookup-code.js';
import { ACCOUNT_FLAG_KINDS, type AccountFlagKind } from '../../identity/identity.schema.js';
import type { AppliedHit } from '../calc/score.calc.js';
import type { LookupDto } from '../screening.schema.js';
import { RULE_LABELS } from '../screening.rules.js';
import { type ScreeningShared, textResultOf } from '../screening.shared.js';

export interface ScreeningLookupService {
  lookup(code: string): Promise<LookupDto>;
}

const FLAG_LABELS: Readonly<Record<AccountFlagKind, string>> = {
  many_accounts_on_device: 'Nhiều tài khoản trên một máy',
  device_of_locked_account: 'Dùng máy của tài khoản bị khoá',
  device_of_struck_account: 'Dùng máy của tài khoản có gậy',
};

const isFlagKind = (kind: string): kind is AccountFlagKind =>
  (ACCOUNT_FLAG_KINDS as readonly string[]).includes(kind);

const PHRASE_CODES = new Set(['certain_phrase', 'ambiguous_phrase']);

/**
 * Hỗ trợ nhập mã tra cứu (spec explanations): lý do cụ thể của đúng lần giữ đó. Đánh dấu thiết bị kèm mã đánh dấu đang
 * mở của `identity` để gỡ khi đúng là nhầm (câu 11) — không bao giờ dấu thiết bị.
 */
export function createLookupService(shared: ScreeningShared): ScreeningLookupService {
  const { repository, identity } = shared;

  return {
    async lookup(code) {
      const run = await repository.findRunByLookupCode(normalizeLookupCode(code));
      if (!run?.decidedAt || !run.outcome || !run.cause) {
        throw new NotFoundError('Không có mã tra cứu này');
      }
      // Cột do chính lượt kết luận ghi (`decide.calc.ts`).
      const hits = run.hits as AppliedHit[];
      const phraseIds = hits
        .filter((hit) => PHRASE_CODES.has(hit.code))
        .flatMap((hit) => hit.refs ?? []);
      const [phrases, flags] = await Promise.all([
        repository.phrasesByIds(phraseIds),
        identity.openFlagsOf(run.accountId),
      ]);
      const text = textResultOf(run);
      const kinds = text.status === 'ok' ? text.deviceFlags.filter(isFlagKind) : [];
      return {
        lookupCode: run.lookupCode ?? code,
        listingId: run.listingId,
        listingVersion: run.listingVersion,
        accountId: run.accountId,
        trigger: run.trigger,
        decidedAt: run.decidedAt.toISOString(),
        outcome: run.outcome,
        cause: run.cause,
        score: run.score,
        band: run.band,
        tier: run.tier,
        ruleVersion: run.ruleVersion,
        configVersion: run.configVersion,
        hits: hits.map((hit) => ({
          code: hit.code,
          label: RULE_LABELS[hit.code],
          weight: hit.weight,
          mode: hit.mode,
          refs: hit.refs ?? [],
          phrases: PHRASE_CODES.has(hit.code)
            ? phrases.filter((phrase) => hit.refs?.includes(phrase.id))
            : [],
        })),
        deviceFlags: kinds.map((kind) => ({
          kind,
          label: FLAG_LABELS[kind],
          flagLookupCode: flags.find((flag) => flag.kind === kind)?.lookupCode ?? null,
        })),
      };
    },
  };
}
