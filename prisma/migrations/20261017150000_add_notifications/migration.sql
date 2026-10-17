-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "push_token" TEXT;

-- CreateTable
CREATE TABLE "conversation_presences" (
    "session_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_presences_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "push_tickets" (
    "id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_presences_conversation_id_idx" ON "conversation_presences"("conversation_id");

-- CreateIndex
CREATE INDEX "push_tickets_created_at_idx" ON "push_tickets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_push_token_key" ON "sessions"("push_token");

-- AddForeignKey
ALTER TABLE "conversation_presences" ADD CONSTRAINT "conversation_presences_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_presences" ADD CONSTRAINT "conversation_presences_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

