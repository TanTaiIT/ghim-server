-- remove-promotion-tier (03/11/2026): gói đẩy tin không còn mức tin cậy tối thiểu — ai đủ Xu là mua được. Lượt mua đã có
-- không chụp mức nên không có gì phải chuyển.
ALTER TABLE "promotion_products" DROP COLUMN "min_tier";
