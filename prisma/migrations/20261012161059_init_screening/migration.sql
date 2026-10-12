-- CreateEnum
CREATE TYPE "screening_trigger" AS ENUM ('submission', 'recall');

-- CreateEnum
CREATE TYPE "screening_outcome" AS ENUM ('pass_full', 'pass_limited', 'hold');

-- CreateEnum
CREATE TYPE "screening_cause" AS ENUM ('score', 'gate', 'always_manual', 'device', 'error', 'timeout');

-- CreateEnum
CREATE TYPE "screening_band" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "image_check_status" AS ENUM ('pending', 'done', 'error');

-- CreateEnum
CREATE TYPE "screening_rule_kind" AS ENUM ('signal', 'gate');

-- CreateEnum
CREATE TYPE "screening_rule_mode" AS ENUM ('on', 'trial', 'off');

-- CreateEnum
CREATE TYPE "banned_phrase_level" AS ENUM ('certain', 'ambiguous');

-- CreateTable
CREATE TABLE "screening_runs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "listing_id" UUID NOT NULL,
    "listing_version" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "trigger" "screening_trigger" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "text_result" JSONB NOT NULL,
    "image_ids" UUID[],
    "decided_at" TIMESTAMPTZ(3),
    "outcome" "screening_outcome",
    "cause" "screening_cause",
    "score" INTEGER,
    "band" "screening_band",
    "tier" "trust_tier",
    "hits" JSONB NOT NULL DEFAULT '[]',
    "explanation" JSONB,
    "lookup_code" TEXT,
    "rank_as_listing_id" UUID,
    "config_version" INTEGER NOT NULL,
    "rule_version" INTEGER NOT NULL,

    CONSTRAINT "screening_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_checks" (
    "image_id" UUID NOT NULL,
    "owner_account_id" UUID NOT NULL,
    "status" "image_check_status" NOT NULL,
    "dhash" BIGINT,
    "band0" INTEGER,
    "band1" INTEGER,
    "band2" INTEGER,
    "band3" INTEGER,
    "band4" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "checked_at" TIMESTAMPTZ(3),

    CONSTRAINT "image_checks_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "image_whitelist" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "dhash" BIGINT NOT NULL,
    "band0" INTEGER NOT NULL,
    "band1" INTEGER NOT NULL,
    "band2" INTEGER NOT NULL,
    "band3" INTEGER NOT NULL,
    "band4" INTEGER NOT NULL,
    "source_image_id" UUID NOT NULL,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "image_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_rules" (
    "code" TEXT NOT NULL,
    "kind" "screening_rule_kind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "mode" "screening_rule_mode" NOT NULL,

    CONSTRAINT "screening_rules_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "screening_rule_overrides" (
    "code" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "weight" INTEGER,
    "mode" "screening_rule_mode",

    CONSTRAINT "screening_rule_overrides_pkey" PRIMARY KEY ("code","category_id")
);

-- CreateTable
CREATE TABLE "screening_category_bands" (
    "category_id" UUID NOT NULL,
    "medium_from" INTEGER NOT NULL,
    "high_from" INTEGER NOT NULL,

    CONSTRAINT "screening_category_bands_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "screening_rule_versions" (
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "screening_rule_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "banned_phrases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "text" TEXT NOT NULL,
    "folded" TEXT NOT NULL,
    "level" "banned_phrase_level" NOT NULL,
    "mode" "screening_rule_mode" NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "activated_by" UUID,
    "activation_reason" TEXT,
    "exceptions" TEXT[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banned_phrases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_cooldowns" (
    "account_id" UUID NOT NULL,
    "until" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "screening_cooldowns_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "category_price_stats" (
    "category_id" UUID NOT NULL,
    "low" BIGINT NOT NULL,
    "high" BIGINT NOT NULL,
    "samples" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_price_stats_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "category_keywords" (
    "category_id" UUID NOT NULL,
    "keyword_folded" TEXT NOT NULL,

    CONSTRAINT "category_keywords_pkey" PRIMARY KEY ("category_id","keyword_folded")
);

-- CreateIndex
CREATE UNIQUE INDEX "screening_runs_lookup_code_key" ON "screening_runs"("lookup_code");

-- CreateIndex
CREATE INDEX "screening_runs_account_id_decided_at_idx" ON "screening_runs"("account_id", "decided_at");

-- CreateIndex
CREATE INDEX "screening_runs_open_idx" ON "screening_runs"("started_at") WHERE (decided_at IS NULL);

-- CreateIndex
CREATE INDEX "screening_runs_open_images_idx" ON "screening_runs" USING GIN ("image_ids") WHERE (decided_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "screening_runs_listing_id_listing_version_trigger_key" ON "screening_runs"("listing_id", "listing_version", "trigger");

-- CreateIndex
CREATE INDEX "image_checks_band0_idx" ON "image_checks"("band0") WHERE (status = 'done');

-- CreateIndex
CREATE INDEX "image_checks_band1_idx" ON "image_checks"("band1") WHERE (status = 'done');

-- CreateIndex
CREATE INDEX "image_checks_band2_idx" ON "image_checks"("band2") WHERE (status = 'done');

-- CreateIndex
CREATE INDEX "image_checks_band3_idx" ON "image_checks"("band3") WHERE (status = 'done');

-- CreateIndex
CREATE INDEX "image_checks_band4_idx" ON "image_checks"("band4") WHERE (status = 'done');

-- CreateIndex
CREATE INDEX "image_whitelist_band0_idx" ON "image_whitelist"("band0");

-- CreateIndex
CREATE INDEX "image_whitelist_band1_idx" ON "image_whitelist"("band1");

-- CreateIndex
CREATE INDEX "image_whitelist_band2_idx" ON "image_whitelist"("band2");

-- CreateIndex
CREATE INDEX "image_whitelist_band3_idx" ON "image_whitelist"("band3");

-- CreateIndex
CREATE INDEX "image_whitelist_band4_idx" ON "image_whitelist"("band4");

-- CreateIndex
CREATE UNIQUE INDEX "banned_phrases_folded_key" ON "banned_phrases"("folded");

-- AddForeignKey
ALTER TABLE "screening_runs" ADD CONSTRAINT "screening_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_rule_overrides" ADD CONSTRAINT "screening_rule_overrides_code_fkey" FOREIGN KEY ("code") REFERENCES "screening_rules"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_rule_overrides" ADD CONSTRAINT "screening_rule_overrides_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_category_bands" ADD CONSTRAINT "screening_category_bands_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_cooldowns" ADD CONSTRAINT "screening_cooldowns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_price_stats" ADD CONSTRAINT "category_price_stats_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_keywords" ADD CONSTRAINT "category_keywords_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "screening_runs"
  ADD CONSTRAINT "screening_runs_decided_check" CHECK (("decided_at" IS NULL) = ("outcome" IS NULL) AND ("outcome" IS NULL) = ("cause" IS NULL)),
  ADD CONSTRAINT "screening_runs_score_check" CHECK ("score" IS NULL OR "score" >= 0);

ALTER TABLE "image_checks"
  ADD CONSTRAINT "image_checks_done_check" CHECK (("status" = 'done') = ("dhash" IS NOT NULL));

ALTER TABLE "screening_rules"
  ADD CONSTRAINT "screening_rules_gate_check" CHECK ("kind" <> 'gate' OR "mode" <> 'off'),
  ADD CONSTRAINT "screening_rules_weight_check" CHECK ("weight" >= 0);

ALTER TABLE "screening_rule_overrides"
  ADD CONSTRAINT "screening_rule_overrides_value_check" CHECK ("weight" IS NOT NULL OR "mode" IS NOT NULL),
  ADD CONSTRAINT "screening_rule_overrides_weight_check" CHECK ("weight" IS NULL OR "weight" >= 0);

ALTER TABLE "screening_category_bands"
  ADD CONSTRAINT "screening_category_bands_order_check" CHECK (0 < "medium_from" AND "medium_from" < "high_from");

ALTER TABLE "banned_phrases"
  ADD CONSTRAINT "banned_phrases_words_check" CHECK ("folded" ~ '\S\s+\S'),
  ADD CONSTRAINT "banned_phrases_trial_check" CHECK ("mode" <> 'trial' OR "trial_ends_at" IS NOT NULL);

ALTER TABLE "category_price_stats"
  ADD CONSTRAINT "category_price_stats_range_check" CHECK ("low" >= 0 AND "low" <= "high" AND "samples" >= 0);
