-- CreateEnum
CREATE TYPE "promotion_effect" AS ENUM ('rank_to_top', 'featured');

-- CreateEnum
CREATE TYPE "promotion_scope" AS ENUM ('marketplace', 'group', 'both');

-- CreateEnum
CREATE TYPE "promotion_purchase_status" AS ENUM ('applied', 'refunded');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "allow_promotions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "promotion_products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effect" "promotion_effect" NOT NULL,
    "duration_days" INTEGER,
    "cooldown_hours" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "min_tier" "trust_tier" NOT NULL,
    "scope" "promotion_scope" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_purchases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "listing_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "group_id" UUID,
    "product_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "effect" "promotion_effect" NOT NULL,
    "duration_days" INTEGER,
    "price" INTEGER NOT NULL,
    "wallet_transaction_id" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "reminded_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "refund_transaction_id" UUID,
    "status" "promotion_purchase_status" NOT NULL DEFAULT 'applied',
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "promotion_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_products_code_key" ON "promotion_products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_purchases_idempotency_key_key" ON "promotion_purchases"("idempotency_key");

-- CreateIndex
CREATE INDEX "promotion_purchases_listing_id_applied_at_idx" ON "promotion_purchases"("listing_id", "applied_at" DESC);

-- CreateIndex
CREATE INDEX "promotion_purchases_account_id_applied_at_idx" ON "promotion_purchases"("account_id", "applied_at" DESC);

-- CreateIndex
CREATE INDEX "promotion_purchases_remind_idx" ON "promotion_purchases"("expires_at") WHERE (status = 'applied' AND effect = 'featured' AND reminded_at IS NULL);



-- CHECK viết tay (add-promotions): gói nổi bật phải có thời hạn, giá từ 1 Xu; lượt mua nổi bật phải có hạn.
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_duration_check"
  CHECK (("effect" = 'featured') = ("duration_days" IS NOT NULL));
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_price_check"
  CHECK ("price" >= 1 AND "cooldown_hours" >= 0 AND "sort" >= 0);
ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_expiry_check"
  CHECK (("effect" = 'featured') = ("expires_at" IS NOT NULL));

-- Lượt mua là bản chụp bất biến: chỉ bốn cột trạng thái về sau đổi được; DELETE chỉ ở lượt dọn tài khoản đã xoá.
CREATE OR REPLACE FUNCTION promotion_purchases_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ghim.purge', true) = 'on' THEN RETURN OLD; END IF;
  ELSIF NEW.id = OLD.id
     AND NEW.listing_id = OLD.listing_id
     AND NEW.account_id = OLD.account_id
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.product_id = OLD.product_id
     AND NEW.product_code = OLD.product_code
     AND NEW.effect = OLD.effect
     AND NEW.duration_days IS NOT DISTINCT FROM OLD.duration_days
     AND NEW.price = OLD.price
     AND NEW.wallet_transaction_id = OLD.wallet_transaction_id
     AND NEW.applied_at = OLD.applied_at
     AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
     AND NEW.idempotency_key = OLD.idempotency_key THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'promotion_purchases is append-only' USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER promotion_purchases_immutable
  BEFORE UPDATE OR DELETE ON "promotion_purchases"
  FOR EACH ROW EXECUTE FUNCTION promotion_purchases_immutable();
