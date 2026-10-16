# Tasks

**Đã duyệt 16/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Mức tin cậy, ảnh

- [x] 1.1 L7: `holdTier` (khoá chung `trust-tier:`), `tierIn` của `trust`, `ListingTrustPort.tierIn`; `decide` của
      `listing/system` đọc mức trong `before(tx, locked)`; cổng giả của test thêm `tierIn`; xác minh test DB: lượt tính
      mức giữ khoá → lượt đọc chờ và thấy mức mới
- [x] 1.2 L9: `recomputeCandidates` gồm T3 còn tin sạch chưa tính; xác minh test DB: T3 thiếu → có, T3 đủ → không
- [x] 1.3 L10: ba lượt xoá dòng ảnh của `media` phát `media.images.deleted`; bên nghe của `screening` xoá dấu ảnh; xác
      minh test: thay ảnh đại diện → lượt đối chiếu phát sự kiện, bộ phát chạy xong thì dấu ảnh cũ mất, ảnh mới còn
- [x] 1.4 L13: ghi vào proposal `add-data-retention` (phần "Chuyển từ rà soát"), cùng khe xoá hẳn tài khoản kéo ảnh

## 2. Tài liệu và kiểm tra tích hợp

- [x] 2.1 `docs/RA-SOAT-15-10-2026.md` (L7, L9, L10, L13), `docs/VIEC-DANG-DO.md`, CLAUDE.md (sự kiện mới và bên nghe)
- [x] 2.2 `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`, `db:drift`; test HTTP / DB trên CI
