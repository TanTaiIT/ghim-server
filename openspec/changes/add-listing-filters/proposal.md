# Proposal

## Why

TK 11 hứa "Người đăng điền theo mẫu, người mua lọc theo đó": mẫu thông tin của danh mục (điện thoại: hãng, dung lượng;
xe máy: năm sản xuất, số km) là để người mua thu hẹp kết quả. Server hiện chỉ lọc theo từ khoá, danh mục, tỉnh, phường,
giá; thông tin người đăng điền theo mẫu nằm trong tin nhưng không lọc được. `ghim-app` ghi việc này ở
`docs/VIEC-DANG-DO.md` mục 8 ("Tìm kiếm: lọc theo mẫu thông tin của danh mục"). Người dùng chọn làm tiếp ngày 24/10/2026
và chốt ba câu hỏi cùng ngày (mục **Đã chốt**).

## What Changes

- Tìm kiếm và bảng tin danh mục nhận thêm bộ lọc theo mẫu thông tin của danh mục đang chọn:
  - mục **chọn một**: chọn một hay nhiều giá trị, tin khớp khi giá trị của nó là một trong số đó;
  - mục **chọn nhiều**: chọn một hay nhiều giá trị, tin khớp khi có **ít nhất một** giá trị đã chọn;
  - mục **số**: từ, tới (một hay cả hai đầu);
  - mục **chữ** không lọc được.
- Lọc theo mẫu chỉ có khi đã chọn danh mục; mục và giá trị kiểm theo mẫu hiện hành của danh mục. Sai thì 400
  `VALIDATION_ERROR` nói rõ mục nào.
- Tin không có mục đang lọc (đăng theo mẫu cũ, hoặc mục không bắt buộc bỏ trống) không hiện khi lọc mục đó.
- Mọi luật hiện có giữ nguyên: ai thấy tin, mức hiển thị, phạm vi nơi đăng, thứ tự theo vị trí trên bảng tin.
- `ghim-app`: màn tìm kiếm có bộ lọc "Thông tin" theo mẫu của danh mục đã chọn.

**Đã chốt** (người dùng, 24/10/2026):

1. Chỉ lọc, **chưa có sắp xếp** — kết quả vẫn xếp theo vị trí trên bảng tin. Gói đẩy tin về sau dựa vào vị trí này.
2. Mục chọn nhiều khớp khi tin có **một trong** các giá trị đã chọn.
3. Tin thiếu mục đang lọc **không hiện**.

**Cố ý không làm**: sắp xếp kết quả (câu 1); lọc mục chữ; lọc theo mẫu trong bảng tin nhóm và gợi ý tin tương tự; tìm
kiếm theo nội dung (TK 29 hoãn).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `listing/visibility`: thêm requirement "Lọc theo mẫu thông tin của danh mục", "Bộ lọc theo mẫu phải đúng mẫu hiện
  hành".

## Impact

- **Code**: `listing` (truy vấn tìm kiếm, kiểm bộ lọc theo mẫu), hỏi mẫu hiện hành qua cổng của `category` đã có
  (`currentTemplate`).
- **API**: `GET /api/v1/listings` thêm tham số `attrs`. Không breaking: thiếu `attrs` thì như hôm nay.
- **Migration**: không.
- **Tài liệu**: TK 11 (cách lọc từng kiểu mục), CLAUDE.md, `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: `npm run api:sync`, bộ lọc "Thông tin" ở màn tìm kiếm.
