# Proposal

## Why

Bộ UI của `ghim-app` có nút sắp xếp ở màn kết quả tìm kiếm (mới nhất, theo giá) nhưng `GET /listings` chỉ xếp theo vị trí
trên bảng tin (spec `listing/visibility` "Vị trí trên bảng tin"), nên app giấu nút đó. TK chưa có dòng nào về sắp xếp
(`docs/VIEC-DANG-DO.md` mục 8). Người dùng chốt ngày 25/10/2026: ba cách — mới nhất (mặc định, như hiện nay), giá tăng
dần, giá giảm dần.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27; luật "ai thấy một tin" (TK 15) không đổi — sắp xếp chỉ
đổi thứ tự của đúng các tin đang được thấy.

## What Changes

- `GET /api/v1/listings` nhận `sort`: `newest` (mặc định — vị trí trên bảng tin, mới trước), `price_asc`, `price_desc`.
  Cùng giá thì xếp theo mã tin để trang sau không lặp, không sót. Áp cho bảng tin, danh mục và tìm kiếm có từ khoá.
- Con trỏ phân trang vẫn là chuỗi kín `[số, mã]`; với cách xếp theo giá, số là giá thay cho mốc thời gian.
- `sort` sai → 400 `VALIDATION_ERROR`.

**Cố ý không làm**: sắp xếp trong bảng tin nhóm, hồ sơ người bán, "Tin của tôi" (không có nút trong app); "gần nhất" (tin
chỉ có tỉnh / phường, không có toạ độ); chỉ mục riêng cho cột giá (quy mô hiện tại quét đủ nhanh — thêm khi chậm).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `listing/visibility`: "Vị trí trên bảng tin" là cách xếp mặc định; thêm "Sắp xếp theo giá".

## Impact

- **Code**: `common/schemas/cursor.ts` (con trỏ dạng số), `listing` (thứ tự theo giá ở repository, nhánh trong `feed`).
- **API**: thêm tham số `sort`. Không breaking — không gửi `sort` thì như cũ, con trỏ cũ vẫn đọc được.
- **Migration**: không.
- **Tài liệu**: TK 11 thêm dòng "Sắp xếp"; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: nút sắp xếp ở màn kết quả tìm kiếm.
