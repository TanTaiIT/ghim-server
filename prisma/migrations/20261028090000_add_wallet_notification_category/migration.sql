-- AlterEnum
-- Một file riêng: giá trị enum mới chưa dùng được trong cùng transaction với lệnh thêm nó (Postgres).
ALTER TYPE "notification_category" ADD VALUE 'wallet';
