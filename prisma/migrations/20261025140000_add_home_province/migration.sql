-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "home_province_code" INTEGER;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_home_province_code_fkey" FOREIGN KEY ("home_province_code") REFERENCES "provinces"("code") ON DELETE SET NULL ON UPDATE CASCADE;

