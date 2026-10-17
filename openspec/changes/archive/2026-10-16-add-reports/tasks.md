# Tasks

**Đã duyệt 16/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Dữ liệu

- [x] 1.1 Migration: enum `review_reason` (`report`, `report_severe`), `review_outcome` (`keep`), `listing_hide_reason`
      (`reported`), enum loại báo cáo, trạng thái báo cáo — file riêng; bảng `reports`, `report_entries`, `reporter_scores`;
      `review_tasks.listing_id` nullable + `account_id` + CHECK + unique; `review_decisions` thêm cột — kèm `///` cho CHECK

## 2. Gửi báo cáo

- [x] 2.1 Cổng: `listing.reportTarget` (thấy được không, người đăng, sàn / nhóm), hồ sơ công khai của người
- [x] 2.2 `report.service`: kiểm theo thứ tự design mục 2, ghi báo cáo + lượt báo, `POST /reports`, `GET /me/reports`
- [x] 2.3 Test: gửi, năm loại, khách, tin không thấy, master, tự báo, 10 mỗi giờ, gộp, báo lại, mở lại sau khi đóng,
      email chưa xác nhận, mất quyền

## 3. Hàng chờ

- [x] 3.1 Lý do `report`, `report_severe` (hàng 1, hạn `review.reportHours`); định tuyến nhóm / staff theo độ nghiêm trọng
- [x] 3.2 Việc về tài khoản: `addAccountReason`, bậc `safety_staff`, viewer có scope, chi tiết việc về người, nhận việc
- [x] 3.3 `cancel` giữ lý do báo cáo; cổng tin kể cả đã xoá cho người xử
- [x] 3.4 Xếp cuối việc của người điểm thấp
- [x] 3.5 Test: ai xử (sàn, nhóm thường, nhóm nghiêm trọng, người, staff an toàn bị báo), lừa đảo thắng khi gộp kể cả đang
      nhận, quá 72 giờ, xoá tin, xoá tài khoản, đóng nhóm, sửa tin, báo cáo liên quan

## 4. Tạm ẩn tự động

- [x] 4.1 Ngưỡng, `auto_hidden_at`, chặn lần hai; lý do ẩn `reported` qua sự kiện + đối chiếu ở `listing`
- [x] 4.2 Test: đủ ngưỡng, hai người, cùng máy, T0, điểm thấp, quá 24 giờ, tin nhóm, người khác 404, người đăng thấy,
      không tự gỡ theo giờ, sửa vẫn ẩn, bác thì hiện lại đủ ngày, không tự ẩn lại sau khi bác

## 5. Quyết định

- [x] 5.1 `report` trong body, `keep`, hệ quả theo quyền, đóng báo cáo, nhật ký, điểm, sự kiện
- [x] 5.2 Bên nghe hệ quả: cấm khỏi nhóm, khoá tài khoản, `trust.voidByReport`
- [x] 5.3 Thông báo N46 cho người báo
- [x] 5.4 Test: thiếu kết quả, bác 3 người, staff gỡ, điều hành viên cấm, staff khoá → 403, master khoá, người báo xem kết
      quả, không thấy người báo khác, người bị báo không thấy ai báo, điểm (gộp, đúng), xếp cuối, mất quyền, hết 30 ngày,
      không phải án phạt

## 6. Tài liệu và kiểm tra tích hợp

- [x] 6.1 `docs/review.md` (báo cáo cho app và bàn vận hành), CLAUDE.md, `docs/VIEC-DANG-DO.md`, `tests/README.md`
- [x] 6.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
