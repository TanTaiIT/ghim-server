# Proposal

## Why

Màn tìm kiếm của `ghim-app` có dải "Báo cho tôi khi có tin mới khớp với «…»" với nút "Lưu", nhưng nút chạy trên dữ liệu
mẫu trong app: lưu xong không ai báo gì, mở lại app là mất. TK chưa có tính năng này — không ở bảng quyền (TK 6), không ở
chín nhóm thông báo (TK 24), không ở mục hoãn (TK 29) — nên đây là tính năng mới, không phải phần còn thiếu. Người dùng
chọn làm ngày 25/10/2026 và chốt năm câu luật cùng ngày (mục "Đã chốt").

Không thuộc đợt nào của TK 29. Đụng TK 15 (ai thấy tin nào): báo theo luật của bảng tin, không theo luật tìm kiếm có từ
khoá.

## What Changes

- Lưu một lượt tìm trên sàn chung: từ khoá (bắt buộc) cùng bộ lọc đang chọn — danh mục, tỉnh, phường, khoảng giá. Lưu lại
  đúng lượt tìm đã có (khác hoa thường, dấu) thì không tạo thêm.
- Xem và xoá các lượt tìm đã lưu (màn mới trong app, mở từ trang Cá nhân).
- Khi một tin **lần đầu hiện ở mức đầy đủ trên sàn chung** và khớp một lượt tìm đã lưu, người lưu được báo. Gộp theo từng
  lượt tìm: chưa đọc thì cập nhật dòng cũ ("3 tin mới khớp tìm kiếm của bạn."), nhắc tối đa mỗi 120 phút. Bấm vào mở màn
  tìm kiếm với đúng lượt tìm đó.
- Nhóm thông báo thứ mười: **tìm kiếm đã lưu**, bật tắt như chín nhóm kia.
- Tối đa **10** lượt tìm đã lưu mỗi tài khoản; lượt thứ 11 nhận 409.
- Xoá tài khoản thì mọi lượt tìm đã lưu bị bỏ.

**Cố ý không làm**: lọc theo mẫu thông tin (`attrs`) trong lượt tìm đã lưu — khớp ngược theo mẫu đổi phiên bản là việc
lớn, để change sau; tin trong nhóm (dải lưu chỉ có ở tìm kiếm sàn chung); tin hiện lại sau khi sửa, gia hạn hay hết tạm ẩn
(chỉ báo tin mới); email hay bản tin theo ngày; lượt tìm tự hết hạn.

## Đã chốt (25/10/2026)

Người dùng chọn đúng năm đề xuất:

1. **Tin hạn chế không được báo.** TK 15 cho tin hạn chế hiện ở tìm kiếm có từ khoá vì người tìm chủ động gõ; báo đẩy tới
   người lưu giống bảng tin và gợi ý hơn — nơi tin hạn chế không lên. Báo cả tin hạn chế thì tài khoản mới lách được mức
   hạn chế bằng cách nhắm đúng từ khoá người ta hay lưu.
2. **Nhóm thông báo thứ mười** "tìm kiếm đã lưu" — tắt được riêng. TK 24 đổi "chín nhóm" thành "mười nhóm".
3. **Trần 10** lượt tìm đã lưu mỗi tài khoản (bảng con số TK 28, `listing.maxSavedSearches`).
4. **Nhắc tối đa mỗi 120 phút** mỗi lượt tìm — bằng "tin mới trong nhóm", khoá riêng
   (`notification.savedSearchAlertMinutes`).
5. **Tin của người mình đã chặn vẫn được báo** — TK 24 chặn chỉ ngăn nhắn tin, không ẩn tin trên bảng tin hay tìm kiếm.

## Capabilities

### New Capabilities

- `listing/saved-searches`: lưu, xem, xoá lượt tìm; báo khi có tin mới khớp.

### Modified Capabilities

- `notification/inbox`: mười nhóm thông báo thay vì chín.
- `notification/preferences`: bật tắt đủ mười nhóm.

## Impact

- **Code**: `listing` (bảng lượt tìm, khớp ngược khi tin lần đầu hiện đầy đủ — cùng phép bỏ dấu của tìm kiếm),
  `notification` (nhóm mới, dòng gộp theo lượt tìm), listener `identity.account.deleted`.
- **API**: `GET` / `POST /me/saved-searches`, `DELETE /me/saved-searches/:id`. Thêm giá trị `saved_searches` vào enum nhóm
  thông báo — app cũ gặp nhóm lạ thì hiện như thông báo thường.
- **Migration**: một bảng mới; thêm giá trị vào enum nhóm thông báo; hai CHECK viết tay.
- **Tài liệu**: TK 6 (bảng quyền thêm "lưu tìm kiếm"), TK 24 (mười nhóm, đoạn "tìm kiếm đã lưu"), TK 28 (hai con số);
  CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: dải "Báo cho tôi…" gọi server và lưu cả bộ lọc; màn "Tìm kiếm đã lưu"; công tắc nhóm thứ mười;
  bấm thông báo mở màn tìm kiếm.
