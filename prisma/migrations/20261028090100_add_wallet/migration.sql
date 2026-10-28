-- CreateEnum
CREATE TYPE "wallet_transaction_type" AS ENUM ('admin_adjust', 'product_purchase', 'refund');

-- CreateTable
CREATE TABLE "wallets" (
    "account_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "wallet_transaction_type" NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "refs" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "actor_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_account_id_created_at_id_idx" ON "wallet_transactions"("account_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- CHECK viết tay (add-wallet): số dư không âm; mỗi dòng sổ cái có số khác 0 và số dư sau không âm. Hai lượt trừ song
-- song xếp hàng trên dòng ví (UPDATE khoá dòng), CHECK là lưới cuối nếu code trừ sai.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_check" CHECK ("balance" >= 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_amount_check" CHECK ("amount" <> 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_balance_check" CHECK ("balance_after" >= 0);

-- Sổ cái không sửa không xoá (spec wallet/ledger): theo mẫu audit_log_immutable. DELETE chỉ ở lượt dọn tài khoản đã xoá
-- của `ops`, transaction đó SET LOCAL ghim.purge = 'on'.
CREATE OR REPLACE FUNCTION wallet_transactions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('ghim.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'wallet_transactions is append-only' USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER wallet_transactions_immutable
  BEFORE UPDATE OR DELETE ON "wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_immutable();
