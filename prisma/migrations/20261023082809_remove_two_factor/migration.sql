/*
  Warnings:

  - You are about to drop the column `totp_enabled_at` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `totp_secret_enc` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `second_factor_at` on the `sessions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "totp_enabled_at",
DROP COLUMN "totp_secret_enc";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "second_factor_at";
