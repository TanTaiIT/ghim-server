/**
 * Mã luật của máy (spec rule-management): mã ổn định, trọng số và chế độ khởi đầu đúng TK 14. Phiên bản luật 1 khởi tạo
 * từ bảng này lúc khởi động; sau đó master chỉnh trên bàn vận hành, không sửa ở đây.
 */
export const SIGNAL_CODES = [
  'gibberish',
  'zero_price_high_value',
  'shared_device_locked',
  'ambiguous_phrase',
  'abnormal_price',
  'off_platform_contact',
  'own_duplicate',
  'burst',
  'high_risk_category',
  'held_many',
  'wrong_category',
  'new_account',
] as const;

/** Cổng cứng: trúng là giữ cho người, mọi mức tin cậy (TK 13) — chạy thử được, không tắt được (câu 19). */
export const GATE_CODES = ['certain_phrase', 'duplicate_image', 'price_over_cap'] as const;

export type SignalCode = (typeof SIGNAL_CODES)[number];
export type GateCode = (typeof GATE_CODES)[number];
export type RuleCode = SignalCode | GateCode;

export const RULE_CODES: readonly RuleCode[] = [...SIGNAL_CODES, ...GATE_CODES];

const GATES: ReadonlySet<RuleCode> = new Set(GATE_CODES);
export const isGate = (code: RuleCode): code is GateCode => GATES.has(code);

const KNOWN: ReadonlySet<string> = new Set(RULE_CODES);
export const isRuleCode = (code: string): code is RuleCode => KNOWN.has(code);

/** Phiên bản luật 1: mọi luật bật (spec rule-management); cổng cứng giữ tin chứ không cộng điểm nên trọng số 0. */
export const INITIAL_WEIGHTS: Readonly<Record<RuleCode, number>> = {
  gibberish: 30,
  zero_price_high_value: 30,
  shared_device_locked: 30,
  ambiguous_phrase: 25,
  abnormal_price: 25,
  off_platform_contact: 20,
  own_duplicate: 20,
  burst: 20,
  high_risk_category: 20,
  held_many: 15,
  wrong_category: 15,
  new_account: 10,
  certain_phrase: 0,
  duplicate_image: 0,
  price_over_cap: 0,
};

/** Dòng `screening_rules` lúc khởi tạo; chế độ do `seedRules` đặt (phiên bản 1 bật, luật thêm về sau chạy thử). */
export const INITIAL_RULES: readonly { code: RuleCode; kind: 'signal' | 'gate'; weight: number }[] =
  RULE_CODES.map((code) => ({
    code,
    kind: isGate(code) ? 'gate' : 'signal',
    weight: INITIAL_WEIGHTS[code],
  }));

/** Tên luật cho bàn vận hành và hỗ trợ — không bao giờ tới người đăng (TK 13). */
export const RULE_LABELS: Readonly<Record<RuleCode, string>> = {
  gibberish: 'Chữ như gõ bừa',
  zero_price_high_value: 'Giá 0 ở danh mục giá trị cao',
  shared_device_locked: 'Trùng thiết bị với tài khoản bị khoá',
  ambiguous_phrase: 'Cụm từ cấm mức mơ hồ',
  abnormal_price: 'Giá bất thường',
  off_platform_contact: 'Liên hệ ngoài sàn',
  own_duplicate: 'Trùng tin của chính mình',
  burst: 'Đăng dồn',
  high_risk_category: 'Danh mục rủi ro cao',
  held_many: 'Bị giữ nhiều',
  wrong_category: 'Sai danh mục',
  new_account: 'Tài khoản mới',
  certain_phrase: 'Cụm từ cấm mức chắc',
  duplicate_image: 'Ảnh trùng',
  price_over_cap: 'Giá vượt trần',
};

/** Lỗi người đăng tự sửa được — câu báo nói cách sửa (spec explanations). */
export const FIXABLE_CODES: ReadonlySet<RuleCode> = new Set([
  'abnormal_price',
  'price_over_cap',
  'wrong_category',
  'off_platform_contact',
]);

/**
 * Dấu hiệu gian lận — câu chung ba phần, không nêu tín hiệu (TK 13). Đánh dấu theo thiết bị không phải một luật (căn cứ
 * `device` của lượt), người gọi tính nó riêng.
 */
export const FRAUD_CODES: ReadonlySet<RuleCode> = new Set([
  'certain_phrase',
  'ambiguous_phrase',
  'duplicate_image',
  'shared_device_locked',
  'burst',
]);
