-- Lý do treo quyền staff là chữ master đọc trên danh sách staff, và `platform` so nó với SUSPENDED_REASON_STRIKE để biết
-- quyền treo vì gậy (rename-strike-to-warning): đổi luôn các dòng cũ, không thì quyền đang treo vì gậy không còn khớp.
UPDATE "staff_permissions" SET "suspended_reason" = 'đang có cảnh cáo' WHERE "suspended_reason" = 'đang có gậy';
