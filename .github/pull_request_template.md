## Thay đổi

<!-- Làm gì, vì sao. Ghi phần TK (THIET-KE-HE-THONG.md) và cam kết ở phần 27 mà thay đổi này đáp ứng. -->

## Kiểm tra

- [ ] `pnpm run check` (typecheck + lint + test)
- [ ] `pnpm test:db`
- [ ] `pnpm run build`, rồi `pnpm start:local` khởi động được
- [ ] Đã thử các ca **thiếu, sai, hết chỗ, quá hạn** — không chỉ đường suôn sẻ (TK 29)

## Đổi schema (xoá mục này nếu không đổi `schema.prisma`)

- Tên migration:
- Có mất dữ liệu không:
- Có backfill / SQL viết tay không:
- [ ] Đã đọc SQL sinh ra. Không có `DROP COLUMN` / `DROP TYPE` / `DROP TABLE` cho một lần đổi tên
- [ ] `pnpm db:drift` ra "No difference detected"
- [ ] `ALTER TYPE … ADD VALUE` nằm ở file migration riêng

### Checklist cho mỗi bảng mới hoặc bảng bị đổi

Quy ước: `CLAUDE.md` mục Luật riêng của Ghim và Migration.

- [ ] Khoá chính `String @id @default(uuid(7)) @db.Uuid`
- [ ] Bảng thuộc đúng MỘT module, và chỉ module đó ghi vào nó
- [ ] Tên bảng / cột snake_case qua `@@map` / `@map`
- [ ] Giá `BigInt` (đồng, không âm); thời điểm `@db.Timestamptz(3)`
- [ ] Trạng thái là `enum` viết thường, đã khai lại tuple `as const` ở tầng HTTP
- [ ] Con số nghiệp vụ (hạn, trần, ngưỡng) đọc từ bảng con số có phiên bản, không thành cột mặc định
- [ ] Unique có cột nullable → tách hai partial unique. "Một việc mở" → partial unique `WHERE` còn mở
- [ ] CHECK / EXCLUDE viết tay trong migration, kèm comment `///` ở model
- [ ] Mỗi ràng buộc chỉ DB trả lời được có test trong `tests/*.db.test.ts`, kiểm đúng mã lỗi
- [ ] Có dữ liệu cá nhân? → hạn lưu theo TK 25, và được tạm giữ khi có báo cáo / gậy / khiếu nại mở
