-- Giá trị enum mới đứng riêng một migration: Postgres không cho dùng giá trị vừa thêm trong cùng transaction
-- (add-reports).
ALTER TYPE "listing_hide_reason" ADD VALUE 'reported';
ALTER TYPE "review_outcome" ADD VALUE 'keep';
ALTER TYPE "review_reason" ADD VALUE 'report';
ALTER TYPE "review_reason" ADD VALUE 'report_severe';
