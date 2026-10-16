# Tasks

**Đã duyệt 16/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Nhóm

- [x] 1.1 L3, L4: `loseOwner` dùng chung; `markOwnerless`, `lockBySystem` của bên nghe khoá chỉ nhận nhóm `active`; bên
      nghe xoá tài khoản gặp dòng chủ gọi `loseOwner`; `completePrivatization` đọc trạng thái chủ sau commit; xác minh
      test HTTP: chủ bị khoá lúc đang chuyển (có / không điều hành viên) → chuyển xong rồi thiếu chủ / tạm khoá; chủ bị
      xoá → thiếu chủ
- [x] 1.2 L5: sự kiện "đã xử" ở sáu chỗ huỷ kèm theo; `acceptOwnerOffer` huỷ lời mời, đơn của người ngoài trước khi
      nhận lời; xác minh test HTTP: vào bằng lời mời, bị cấm, người ngoài nhận lời giao chủ, nhóm tạm khoá huỷ lời
      chuyển chủ
- [x] 1.3 L6: công tắc hiện tên xét theo chế độ hiện hành; migration khoá ngoại thông báo → đơn vị; xác minh test HTTP:
      409 `GROUP_MODE_CONFLICT`; xoá lớp xoá thông báo riêng của lớp

## 2. Tài liệu và kiểm tra tích hợp

- [x] 2.1 `docs/RA-SOAT-15-10-2026.md` (L3, L4, L5, L6), `docs/VIEC-DANG-DO.md`
- [x] 2.2 `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`, `db:drift`; test HTTP / DB trên CI
