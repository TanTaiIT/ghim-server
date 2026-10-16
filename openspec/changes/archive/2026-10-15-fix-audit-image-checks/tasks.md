# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Schema và hàng việc

- [x] 1.1 Migration `fix_audit_image_checks`: `image_checks.queued_at` kèm partial index, bảng `screening_unchecked_marks`;
      xác minh `pnpm db:drift`
- [x] 1.2 `jobs.send(name, data, { startAfter })` (bản thật và bản giả của test); xác minh test hàng việc

## 2. Kiểm ảnh (C2, T20)

- [x] 2.1 Repository: xếp có điều kiện (`claimQueued`, `claimStalePending`, `unqueue`), ghi kết quả có điều kiện
      `pending`; `scheduleChecks` không dừng ở lượt đã kết luận, gửi hỏng thì trả `queued_at` về trống; xác minh test: chấm
      chữ lỗi vẫn kiểm đủ ảnh; gửi việc hỏng rồi bên nghe chạy lại thì gửi lại; hai việc cùng ảnh không ghi đè
- [x] 2.2 Lưới an toàn: xếp lại ảnh kẹt (trần 500), thêm dòng cho ảnh của tin đang hiện chưa có dòng, hạn chế một lần mỗi
      phiên bản qua `screening_unchecked_marks`; xác minh test: ảnh kẹt xếp lại đúng một lần qua hai lượt rà; người duyệt
      cho đạt rồi lượt rà sau không hạn chế lại

## 3. `listing` (L8)

- [x] 3.1 `screening.listing.restricted` mang `listingVersion`; `restrictByMachine(listingId, version?)` chỉ áp cho tin
      còn đúng phiên bản; xác minh test: sự kiện cũ (phiên bản trước) không hạn chế tin

## 4. Cụm từ (C11)

- [x] 4.1 Bật thật cụm mức chắc gửi thêm việc quét có `startAfter`; quét bỏ qua tin đã có lượt `recall` vì cụm đó; xác minh
      test: tin đang chờ ảnh lúc bật bị rút ở lượt quét hai; tin đã rút rồi được cho đạt không bị rút lại

## 5. Tài liệu và kiểm tra tích hợp

- [x] 5.1 `docs/RA-SOAT-15-10-2026.md` (C2, T20, L8, C11), `docs/VIEC-DANG-DO.md`, CLAUDE.md, `docs/screening.md` nếu có mô
      tả luồng kiểm ảnh
- [x] 5.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
