-- Giá trị enum mới đứng riêng một migration: Postgres không cho dùng giá trị vừa thêm trong cùng transaction
-- (add-strikes).
ALTER TYPE "account_flag_kind" ADD VALUE 'device_of_struck_account';
ALTER TYPE "code_purpose" ADD VALUE 'locked_appeal';
ALTER TYPE "listing_restriction" ADD VALUE 'strike_wave';
ALTER TYPE "review_outcome" ADD VALUE 'violation';
ALTER TYPE "review_reason" ADD VALUE 'appeal';
ALTER TYPE "review_reason" ADD VALUE 'serious_strike';
ALTER TYPE "review_reason" ADD VALUE 'permanent_review';
