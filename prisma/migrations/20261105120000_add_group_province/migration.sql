-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "province_code" INTEGER;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE SET NULL ON UPDATE CASCADE;
