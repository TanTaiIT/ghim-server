# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. `identity`

- [x] 1.1 Google gặp đăng ký chưa xác nhận (design mục 1): xoá có điều kiện dòng `pending_verification`, tạo tài khoản
      mới, cắt socket của phiên cũ; xác minh test HTTP: phiên cũ 401 `SESSION_REVOKED`, mật khẩu cũ 401
      `INVALID_CREDENTIALS`, tài khoản mới đã xác nhận; ca email đã xác nhận vẫn vào tài khoản cũ
- [x] 1.2 Master không bị xoá hay khoá (design mục 2): `softDelete` và `lockAccount` chặn khi đích là master; xác minh test
      HTTP: tự xoá trong app, xoá bằng email cùng mật khẩu, tự khoá — đều 409, master vẫn hoạt động, phiên vẫn dùng được
- [x] 1.3 Lớp thứ hai đã bật không thiết lập lại được qua app (design mục 3); xác minh test HTTP: thiết lập lần hai 409
      `TWO_FACTOR_ENABLED` và đăng nhập vẫn đòi mã cũ; sau `resetTwoFactor` thiết lập lại được và đăng nhập đòi mã mới
- [x] 1.4 TK 7 thêm dòng "Đăng ký chưa xác nhận không giữ được email"; sinh lại `docs/THIET-KE-HE-THONG.pdf`

## 2. `review`

- [x] 2.1 Bề mặt nhóm không mang quyền master (design mục 4); xác minh test HTTP: master xem, nhận việc của nhóm qua
      route nhóm → 404 `NOT_FOUND`; xem hàng chờ của nhóm → 403 `FORBIDDEN`; master nhận và quyết cùng việc đó ở bàn
      vận hành → quyết định ghi vai `master`

## 3. Bảng con số

- [x] 3.1 Khoảng hợp lệ của từng khoá và ràng buộc giữa các khoá (design mục 5) trong sổ đăng ký; `changeConfig` kiểm
      cả bộ con số sau khi ghép thay đổi; xác minh unit test: mọi giá trị khởi đầu nằm trong khoảng, mỗi trần / sàn và
      mỗi ràng buộc chéo có một ca sai; test HTTP: ra ngoài khoảng → 400 `VALIDATION_ERROR`, phiên bản không đổi
- [x] 3.2 CLAUDE.md (luật của bảng con số), `docs/RA-SOAT-15-10-2026.md` đánh dấu C3, C4, C5, C6, T10,
      `docs/VIEC-DANG-DO.md` mục 0 chuyển sang đợt 2

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check` (typecheck, lint, format, test, `spec:validate`), `pnpm run build`, `pnpm db:drift`
