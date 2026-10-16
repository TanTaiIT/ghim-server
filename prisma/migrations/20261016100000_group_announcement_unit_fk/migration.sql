-- fix-audit-group-low (L6): xoá đơn vị thì xoá thông báo gửi riêng cho nó. Để trống `unit_id` thì thông báo thành gửi
-- cả nhóm — rộng hơn người gửi chọn.

-- Thông báo của đơn vị đã xoá trước khi có khoá ngoại: không ai còn thấy (không ai thuộc đơn vị đó).
DELETE FROM "group_announcements" a
 WHERE a."unit_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "group_units" u WHERE u."group_id" = a."group_id" AND u."id" = a."unit_id");

-- AddForeignKey
ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_group_id_unit_id_fkey" FOREIGN KEY ("group_id", "unit_id") REFERENCES "group_units"("group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
