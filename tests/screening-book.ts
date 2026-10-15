import type { RuleBook, RuleSetting } from '../src/modules/screening/calc/score.calc.js';
import {
  INITIAL_WEIGHTS,
  RULE_CODES,
  type RuleCode,
} from '../src/modules/screening/screening.rules.js';

/** Phiên bản luật 1 như lúc khởi tạo (mọi luật bật, trọng số TK 14), ngưỡng dải chung 30 / 60. */
export function initialBook(
  rules: Partial<Record<RuleCode, Partial<RuleSetting>>> = {},
  patch: Partial<Omit<RuleBook, 'rules'>> = {},
): RuleBook {
  return {
    version: 1,
    rules: new Map<RuleCode, RuleSetting>(
      RULE_CODES.map((code) => [
        code,
        { weight: INITIAL_WEIGHTS[code], mode: 'on', ...rules[code] },
      ]),
    ),
    overrides: {},
    bands: {},
    defaultBands: { mediumFrom: 30, highFrom: 60 },
    ...patch,
  };
}
