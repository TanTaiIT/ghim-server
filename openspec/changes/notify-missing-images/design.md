# Design

## Context

- Lượt đối chiếu hằng tháng (`media.reconcile`) so kho với DB; ảnh đang dùng (đã xác nhận, chưa bị bỏ) mà không còn
  tệp thì `media` phát `media.image.missing` qua outbox, payload `{ imageId, ownerKind, ownerId }` — `ownerId` là mã tin
  (`listing`) hay mã tài khoản (`profile`).
- `notification` biến sự kiện của module khác thành thông báo theo ma trận (N1–N37); câu cần tiêu đề tin thì hỏi
  `listing` qua cổng (`listingTitles`), không đọc bảng `listings` (TK 30).
- Chưa ai nghe `media.image.missing`: sự kiện được phát rồi bỏ đó.

## Decisions

### 1. `notification` nghe thẳng sự kiện của `media`

Không chèn bước trung gian (`listing` nghe rồi phát lại một sự kiện `listing.*`): thêm một lượt outbox, một sự kiện
mới, mà `listing` không quyết gì — TK 25 cấm sửa tin. `notification` đăng ký nghe `media.image.missing` như đang nghe
`group.*` và `listing.*`; ma trận quyết ai nhận, câu gì.

### 2. Ma trận

| Mã  | Chủ ảnh   | Người nhận                | Nhóm                 | Nhắc | Câu                                                                            |
| --- | --------- | ------------------------- | -------------------- | ---- | ------------------------------------------------------------------------------ |
| N38 | `listing` | người đăng — tin chưa xoá | tin đăng của bạn     | có   | tiêu đề tin · "Một ảnh của tin không còn trong kho — mở tin để thay ảnh khác." |
| N39 | `profile` | chủ tài khoản             | tài khoản (luôn bật) | có   | "Ảnh đại diện" · "Ảnh đại diện của bạn không còn trong kho — chọn ảnh khác."   |

- Cả hai là chuyện về chính người nhận (`personal`): tắt tiếng nhóm không chặn nhắc.
- N38 gộp theo tin (khoá `listings:image-missing:<mã tin>`): dòng chưa đọc cùng tin được cập nhật thành "<n> ảnh của tin
  không còn trong kho — mở tin để thay ảnh khác." thay vì thêm dòng — một tin 6 ảnh mất cả 6 là một dòng.
- Tin đã xoá (người đăng tự xoá, đang chờ xoá hẳn) hay không còn: không báo — người đăng không còn việc gì để làm.
- Tháng sau lượt đối chiếu còn thấy ảnh mất thì phát lại sự kiện, nên báo lại: lời nhắc hằng tháng tới khi người dùng
  thay ảnh. Không lưu "đã báo" — thêm cột chỉ để chặn một lời nhắc mỗi tháng là không đáng.

### 3. Cổng `listing` cho `notification`

Cổng hiện có `titles(ids)` chỉ trả tiêu đề. Thêm `noticeTargets(ids)` ở `listing/read`: với mỗi tin **chưa xoá**, trả
`{ ownerId, title }`; tin đã xoá hay không có thì vắng khỏi kết quả. `MatrixContext` thêm `listingTargets` gọi cổng đó.

### 4. Không đổi gì khác

- Không đổi DB, không migration.
- `media` không đổi: sự kiện đã đủ dữ kiện.
- Không sửa tin, hồ sơ (TK 25); không đổi hiển thị của tin thiếu ảnh.

## Risks / Trade-offs

- Lượt đối chiếu chỉ chạy mỗi tháng (TK 26): ảnh mất giữa tháng thì tới lượt sau mới báo. Đúng TK; báo sớm hơn cần một
  lượt kiểm khác, không thuộc change này.
- Ảnh mất hằng loạt (kho sự cố) → mỗi người đăng nhận một dòng mỗi tin. Gộp theo tin giữ số dòng bằng số tin bị ảnh
  hưởng, không bằng số ảnh.
