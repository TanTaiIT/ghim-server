import type { ScreeningRuleKind, ScreeningRuleMode } from '@prisma/client';

import { type AuditEntry, auditActor } from '../../../common/audit/audit.js';
import type { Actor } from '../../../common/auth/actor.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import type { BandsBody, RuleChangeBody, RulesDto } from '../screening.schema.js';
import type { Tx } from '../screening.repository.js';
import { INITIAL_RULES, isRuleCode, RULE_LABELS } from '../screening.rules.js';
import { bandThresholds, type ScreeningShared } from '../screening.shared.js';

export interface ScreeningRulesService {
  listRules(): Promise<RulesDto>;
  changeRule(actor: Actor, code: string, body: RuleChangeBody): Promise<RulesDto>;
  setOverride(
    actor: Actor,
    code: string,
    categoryId: string,
    body: RuleChangeBody,
  ): Promise<RulesDto>;
  clearOverride(actor: Actor, code: string, categoryId: string): Promise<void>;
  setBands(actor: Actor, categoryId: string, body: BandsBody): Promise<RulesDto>;
  /** Bước khởi động: 12 dấu hiệu, 3 cổng cứng, phiên bản luật 1 — chạy lại không tạo thêm (task 1.4). */
  ensureRules(): Promise<{ version: number; added: number } | null>;
}

const validation = (message: string): BadRequestError =>
  new BadRequestError(message, 'VALIDATION_ERROR');

/** Cổng cứng chạy thử được, không tắt được (câu 19) — CHECK của DB chặn lần nữa nếu lọt. */
const assertGateMode = (kind: ScreeningRuleKind, mode: ScreeningRuleMode | undefined): void => {
  if (kind === 'gate' && mode === 'off') {
    throw validation('Cổng cứng chỉ chạy thử được, không tắt được');
  }
};

/** Luật trên bàn vận hành (spec rule-management): chỉ master; mỗi lần đổi một phiên bản luật và một dòng nhật ký. */
export function createRulesService(shared: ScreeningShared): ScreeningRulesService {
  const { repository, categories, config, clock } = shared;

  const knownRule = async (code: string) => {
    const rule = isRuleCode(code) ? await repository.findRule(code) : null;
    if (!rule) throw new NotFoundError('Không có luật này');
    return rule;
  };

  const knownCategory = async (categoryId: string): Promise<void> => {
    if (!(await categories.existingIds([categoryId])).has(categoryId)) {
      throw new NotFoundError('Không có danh mục này');
    }
  };

  const change = <T>(
    actor: Actor,
    audit: Omit<AuditEntry, 'actorId' | 'actorRole'>,
    work: (tx: Tx) => Promise<T | null>,
  ) =>
    repository.changeRules(
      {
        createdBy: actor.accountId,
        at: clock(),
        audit: () => ({ ...auditActor(actor), ...audit }),
      },
      work,
    );

  const listRules = async (): Promise<RulesDto> => {
    const [{ rules, overrides, bands }, version] = await Promise.all([
      repository.listRules(),
      repository.ruleVersionNumber(),
    ]);
    return {
      version: version ?? 0,
      rules: rules.flatMap(({ code, kind, weight, mode }) =>
        isRuleCode(code) ? [{ code, label: RULE_LABELS[code], kind, weight, mode }] : [],
      ),
      overrides: overrides.flatMap((row) =>
        isRuleCode(row.code) ? [{ ...row, code: row.code }] : [],
      ),
      bands: bands.map(({ categoryId, mediumFrom, highFrom }) => ({
        categoryId,
        mediumFrom,
        highFrom,
      })),
      defaultBands: bandThresholds(config),
    };
  };

  return {
    listRules,

    async changeRule(actor, code, body) {
      const rule = await knownRule(code);
      assertGateMode(rule.kind, body.mode);
      await change(
        actor,
        {
          action: 'screening.rule.change',
          targetType: 'screening_rule',
          targetId: code,
          details: { weight: body.weight ?? null, mode: body.mode ?? null },
        },
        async (tx) => {
          await repository.updateRule(tx, code, {
            ...(body.weight === undefined ? {} : { weight: body.weight }),
            ...(body.mode === undefined ? {} : { mode: body.mode }),
          });
          return true;
        },
      );
      return listRules();
    },

    async setOverride(actor, code, categoryId, body) {
      const rule = await knownRule(code);
      assertGateMode(rule.kind, body.mode);
      await knownCategory(categoryId);
      await change(
        actor,
        {
          action: 'screening.rule.override',
          targetType: 'screening_rule',
          targetId: code,
          details: { categoryId, weight: body.weight ?? null, mode: body.mode ?? null },
        },
        async (tx) => {
          await repository.upsertOverride(tx, {
            code,
            categoryId,
            weight: body.weight ?? null,
            mode: body.mode ?? null,
          });
          return true;
        },
      );
      return listRules();
    },

    async clearOverride(actor, code, categoryId) {
      await knownRule(code);
      const cleared = await change(
        actor,
        {
          action: 'screening.rule.override_clear',
          targetType: 'screening_rule',
          targetId: code,
          details: { categoryId },
        },
        async (tx) => ((await repository.deleteOverride(tx, code, categoryId)) ? true : null),
      );
      if (!cleared) throw new NotFoundError('Luật này không có ghi đè cho danh mục đó');
    },

    async setBands(actor, categoryId, body) {
      await knownCategory(categoryId);
      await change(
        actor,
        {
          action: 'screening.band.change',
          targetType: 'category',
          targetId: categoryId,
          details: { mediumFrom: body.mediumFrom, highFrom: body.highFrom },
        },
        async (tx) => {
          await repository.upsertBands(tx, { categoryId, ...body });
          return true;
        },
      );
      return listRules();
    },

    ensureRules: () => repository.seedRules(INITIAL_RULES, clock()),
  };
}
