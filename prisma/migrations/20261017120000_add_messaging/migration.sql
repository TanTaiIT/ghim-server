-- AlterTable
ALTER TABLE "report_entries" ADD COLUMN     "conversation_id" UUID;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "listing_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "buyer_messages" INTEGER NOT NULL DEFAULT 0,
    "buyer_hidden_at" TIMESTAMPTZ(3),
    "seller_hidden_at" TIMESTAMPTZ(3),
    "buyer_read_at" TIMESTAMPTZ(3),
    "seller_read_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "conversations_buyer_id_last_activity_at_idx" ON "conversations"("buyer_id", "last_activity_at");

-- CreateIndex
CREATE INDEX "conversations_seller_id_last_activity_at_idx" ON "conversations"("seller_id", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_listing_id_buyer_id_key" ON "conversations"("listing_id", "buyer_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "account_blocks_blocked_id_idx" ON "account_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "report_entries_conversation_idx" ON "report_entries"("conversation_id") WHERE (conversation_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_blocks" ADD CONSTRAINT "account_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_blocks" ADD CONSTRAINT "account_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK viết tay (add-messaging): hai bên của hội thoại và hai đầu của lệnh chặn phải là hai người khác nhau.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_parties_check" CHECK ("buyer_id" <> "seller_id");
ALTER TABLE "account_blocks" ADD CONSTRAINT "account_blocks_self_check" CHECK ("blocker_id" <> "blocked_id");
