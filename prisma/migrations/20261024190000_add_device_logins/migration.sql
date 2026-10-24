-- CreateTable
CREATE TABLE "device_logins" (
    "device_hash" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_logins_pkey" PRIMARY KEY ("device_hash","account_id")
);

-- CreateIndex
CREATE INDEX "device_logins_account_id_idx" ON "device_logins"("account_id");

-- CreateIndex
CREATE INDEX "device_logins_last_seen_at_idx" ON "device_logins"("last_seen_at");

-- AddForeignKey
ALTER TABLE "device_logins" ADD CONSTRAINT "device_logins_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK tay (CLAUDE.md luật 5): lần gần nhất không đứng trước lần đầu, như device_posts.
ALTER TABLE "device_logins"
  ADD CONSTRAINT "device_logins_order_check" CHECK ("last_seen_at" >= "first_seen_at");
