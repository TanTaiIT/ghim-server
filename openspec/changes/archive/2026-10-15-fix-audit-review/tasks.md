# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Hàng chờ

- [x] 1.1 T5: `lockForReview` trả phiên bản / trạng thái; `addReason`, `dropReasons`, `cancel` kiểm `expect`; xác minh test:
      lượt "giữ" xử lại sau khi rút về nháp không sinh việc
- [x] 1.2 T7: `ReviewSubject.hideReasons`; bỏ lấy mẫu tin ẩn; bên nghe `detached`, `ban.created`; gỡ cấm người ngoài sinh lại
      việc; xác minh test: cấm / gỡ cấm người ngoài, tin ẩn không bị lấy mẫu
- [x] 1.3 T4: huỷ việc khi xoá tài khoản; xác minh test: không nhắc master sau 73 giờ
- [x] 1.4 T8: bên nghe đổi đơn vị; đơn vị khi vào nhóm và khi thu hẹp; xác minh test: chuyển 10A → 10B

## 2. Quyết định

- [x] 2.1 T6, L11: đóng việc có điều kiện, thứ tự lỗi; xác minh test: quyết hai lần → một 200 một 409 `TASK_CLOSED`, một
      dòng nhật ký; việc chuyển master trong lúc nhận → 409 `TASK_REASSIGNED`
- [x] 2.2 T2: migration `approved_by`; ghi ứng viên kèm người đạt / khôi phục; lấy mẫu loại người đó; xác minh test
- [x] 2.3 T1: chuyển lên sàn chung khi có việc chờ → 409; xác minh test

## 3. Nhóm và thông báo

- [x] 3.1 T3: `reviewersOf` bỏ người bị khoá, chủ của nhóm thiếu chủ; xác minh test
- [x] 3.2 T9: con số `notification.reviewAlertMinutes`, N40 nêu tổng số; xác minh test

## 4. Tài liệu và kiểm tra tích hợp

- [x] 4.1 `docs/RA-SOAT-15-10-2026.md` (T1–T9, L11), `docs/VIEC-DANG-DO.md`, CLAUDE.md
- [x] 4.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
