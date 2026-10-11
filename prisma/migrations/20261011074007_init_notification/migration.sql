-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('messages', 'your_listings', 'your_groups', 'your_reports', 'account', 'trust_strikes', 'group_announcements', 'group_new_listings', 'support');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "recipient_id" UUID NOT NULL,
    "category" "notification_category" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "detail" TEXT,
    "data" JSONB NOT NULL,
    "group_id" UUID,
    "collapse_key" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "alert" BOOLEAN NOT NULL,
    "alerted_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "source_event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "account_id" UUID NOT NULL,
    "category" "notification_category" NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("account_id","category")
);

-- CreateTable
CREATE TABLE "group_notification_mutes" (
    "account_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_notification_mutes_pkey" PRIMARY KEY ("account_id","group_id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_updated_at_idx" ON "notifications"("recipient_id", "updated_at");

-- CreateIndex
CREATE INDEX "notifications_unread_idx" ON "notifications"("recipient_id") WHERE (read_at IS NULL);

-- CreateIndex
CREATE INDEX "notifications_collapse_idx" ON "notifications"("recipient_id", "collapse_key") WHERE (read_at IS NULL AND collapse_key IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_source_event_id_recipient_id_key" ON "notifications"("source_event_id", "recipient_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_notification_mutes" ADD CONSTRAINT "group_notification_mutes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_notification_mutes" ADD CONSTRAINT "group_notification_mutes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_count_check" CHECK ("count" >= 1);
