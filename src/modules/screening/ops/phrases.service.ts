import type { BannedPhrase } from '@prisma/client';

import { type AuditEntry, auditActor } from '../../../common/audit/audit.js';
import type { Actor } from '../../../common/auth/actor.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import { phraseWords } from '../calc/phrase.calc.js';
import type { Tx } from '../screening.repository.js';
import { RESCAN_SETTLE_MINUTES, SCREENING_JOBS } from '../screening.jobs.js';
import type { CreatePhraseBody, PatchPhraseBody, PhraseDto } from '../screening.schema.js';
import { DAY_MS, MINUTE_MS, type ScreeningShared } from '../screening.shared.js';

export interface ScreeningPhrasesService {
  listPhrases(): Promise<PhraseDto[]>;
  createPhrase(actor: Actor, body: CreatePhraseBody): Promise<PhraseDto>;
  updatePhrase(actor: Actor, id: string, body: PatchPhraseBody): Promise<PhraseDto>;
  activatePhrase(actor: Actor, id: string, reason: string | undefined): Promise<PhraseDto>;
  deactivatePhrase(actor: Actor, id: string): Promise<PhraseDto>;
}

/** Từ đơn như "súng" bỏ dấu thành "sung", trùng "bổ sung", "quả sung" (spec banned-phrases). */
const MIN_PHRASE_WORDS = 2;

const toPhraseDto = (row: BannedPhrase): PhraseDto => ({
  id: row.id,
  text: row.text,
  level: row.level,
  mode: row.mode,
  exceptions: row.exceptions,
  trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
  activatedAt: row.activatedAt?.toISOString() ?? null,
  activationReason: row.activationReason,
  createdAt: row.createdAt.toISOString(),
});

/** Cụm từ cấm trên bàn vận hành (design mục 7): chỉ master; mỗi lần đổi một phiên bản luật — bộ so cụm dựng lại theo nó. */
export function createPhrasesService(shared: ScreeningShared): ScreeningPhrasesService {
  const { repository, jobs, config, clock } = shared;

  const knownPhrase = async (id: string): Promise<BannedPhrase> => {
    const phrase = await repository.findPhrase(id);
    if (!phrase) throw new NotFoundError('Không có cụm từ này');
    return phrase;
  };

  /** Nhật ký nhắm đúng cụm vừa ghi — lúc thêm mới thì mã cụm chỉ có sau khi ghi. */
  const write = async (
    actor: Actor,
    audit: Omit<AuditEntry, 'actorId' | 'actorRole' | 'targetType' | 'targetId'>,
    work: (tx: Tx) => Promise<BannedPhrase | null>,
  ): Promise<BannedPhrase | null> =>
    (
      await repository.changeRules(
        {
          createdBy: actor.accountId,
          at: clock(),
          audit: (row) => ({
            ...auditActor(actor),
            ...audit,
            targetType: 'banned_phrase',
            targetId: row.id,
          }),
        },
        work,
      )
    )?.result ?? null;

  const update = async (
    actor: Actor,
    id: string,
    action: AuditEntry['action'],
    patch: Parameters<typeof repository.updatePhrase>[2],
    reason: string | null = null,
  ): Promise<BannedPhrase> => {
    const row = await write(actor, { action, reason }, (tx) =>
      repository.updatePhrase(tx, id, patch),
    );
    if (!row) throw new NotFoundError('Không có cụm từ này');
    return row;
  };

  /**
   * Hai lượt quét tin đang hiện: ngay, và khi tin đang kiểm lúc đổi đã có kết luận — quá thời gian chờ ảnh, cộng một chu kỳ
   * rà và độ trễ outbox (C11). Gửi lặp vô hại: lượt quét đọc lại cụm lúc chạy và bỏ qua tin đã rút vì cụm (T22).
   */
  const sendRescans = async (phraseId: string, now: Date): Promise<void> => {
    await jobs.send(SCREENING_JOBS.rescanPhrase, { phraseId });
    const settleMinutes = config.get('screening.imageResultTimeoutMinutes') + RESCAN_SETTLE_MINUTES;
    await jobs.send(
      SCREENING_JOBS.rescanPhrase,
      { phraseId },
      { startAfter: new Date(now.getTime() + settleMinutes * MINUTE_MS) },
    );
  };

  return {
    async listPhrases() {
      return (await repository.listPhrases()).map(toPhraseDto);
    },

    async createPhrase(actor, { text, level, exceptions }) {
      const words = phraseWords(text);
      if (words.length < MIN_PHRASE_WORDS) {
        throw new BadRequestError(
          'Cụm từ cấm cần từ hai chữ trở lên — từ đơn dễ giữ nhầm tin bình thường',
          'BANNED_PHRASE_TOO_SHORT',
        );
      }
      const now = clock();
      const row = await write(
        actor,
        { action: 'screening.phrase.create', details: { level } },
        (tx) =>
          repository.createPhrase(tx, {
            text,
            folded: words.join(' '),
            level,
            mode: 'trial',
            trialEndsAt: new Date(
              now.getTime() + config.get('screening.bannedPhraseTrialDays') * DAY_MS,
            ),
            exceptions,
            createdBy: actor.accountId,
            createdAt: now,
          }),
      );
      if (!row) throw new ConflictError('Đã có cụm từ này', 'BANNED_PHRASE_EXISTS');
      return toPhraseDto(row);
    },

    async updatePhrase(actor, id, body) {
      const before = await knownPhrase(id);
      const patch = {
        ...(body.level === undefined ? {} : { level: body.level }),
        ...(body.exceptions === undefined ? {} : { exceptions: body.exceptions }),
      };
      const row = await update(actor, id, 'screening.phrase.update', patch);
      // Cụm mức chắc đang bật vừa nâng mức hay hẹp ngoại lệ: tin đang hiện có thể vừa thành vi phạm (T22).
      const tightened =
        before.level !== 'certain' ||
        before.exceptions.some((exception) => !row.exceptions.includes(exception));
      if (row.level === 'certain' && row.mode === 'on' && tightened) {
        await sendRescans(id, clock());
      }
      return toPhraseDto(row);
    },

    async activatePhrase(actor, id, reason) {
      const phrase = await knownPhrase(id);
      // Bấm bật lại cụm mức chắc đang bật: làm lại lượt quét có thể đã lỡ (gửi việc hỏng, hết lượt thử — T22).
      if (phrase.mode === 'on') {
        if (phrase.level === 'certain') await sendRescans(id, clock());
        return toPhraseDto(phrase);
      }
      const now = clock();
      const early = phrase.trialEndsAt !== null && now < phrase.trialEndsAt;
      if (early && !reason) {
        throw new BadRequestError(
          'Bật thật trước khi đủ ngày chạy thử cần ghi lý do',
          'VALIDATION_ERROR',
        );
      }
      const row = await update(
        actor,
        id,
        'screening.phrase.activate',
        {
          mode: 'on',
          activatedAt: now,
          activatedBy: actor.accountId,
          activationReason: reason ?? null,
        },
        reason ?? null,
      );
      // Sau commit: việc quét đọc đúng chế độ vừa ghi. Cụm mơ hồ không quét (câu 3).
      if (row.level === 'certain') await sendRescans(id, now);
      return toPhraseDto(row);
    },

    async deactivatePhrase(actor, id) {
      await knownPhrase(id);
      return toPhraseDto(await update(actor, id, 'screening.phrase.deactivate', { mode: 'off' }));
    },
  };
}
