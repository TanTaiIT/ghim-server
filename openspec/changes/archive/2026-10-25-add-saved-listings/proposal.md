# Proposal

## Why

Bảng quyền ở TK 6 cho người đã đăng nhập "lưu tin", còn TK 29 xếp "Lưu tin để xem sau" vào mục hoãn: chưa mô tả, làm
thành phần riêng sau đợt tin đăng (chốt 12/10/2026). Server vì thế chưa có chỗ lưu, nên mục "Đã lưu" ở trang Cá nhân và nút trái tim trên thẻ tin của `ghim-app` vẫn chạy trên dữ liệu mẫu trong app. Hệ quả người dùng
thấy được (25/10/2026): mở một tin trong "Đã lưu" ra tin mẫu với người bán mẫu, bấm "Xem trang" thì server trả 400
`VALIDATION_ERROR` vì mã người bán không phải tài khoản thật. Người dùng chốt hướng sửa tận gốc cùng ngày ("tiến hành
sửa tận gốc"): làm phần lưu tin ở server rồi nối app vào.

Đợt tin đăng đã xong, nên change này là "phần riêng" TK 29 hẹn: thêm đoạn mô tả vào TK 15 và gỡ mục khỏi danh sách
hoãn. Không đụng cam kết nào ở TK 27.

## What Changes

- `PUT /api/v1/me/saved-listings/:listingId` — lưu một tin người đó đang mở được; lưu lại tin đã lưu không đổi gì.
- `DELETE /api/v1/me/saved-listings/:listingId` — bỏ lưu; tin chưa lưu thì cũng không lỗi.
- `GET /api/v1/me/saved-listings?cursor=&limit=` — tin đã lưu mà người lưu còn mở được (đang hiển thị, đã bán, hết hạn,
  mỗi tin kèm trạng thái), lưu gần nhất trước, phân trang con trỏ như mọi danh sách tin.
- `GET /api/v1/me/saved-listings/ids` — mã mọi tin đã lưu, để app tô nút trái tim trên thẻ.
- Xoá tài khoản thì mọi tin người đó đã lưu bị bỏ.
- `ghim-app`: mục "Đã lưu" và nút trái tim đọc / ghi server; bỏ dữ liệu mẫu tin đăng còn lại (màn chi tiết không còn
  nhánh đọc tin mẫu).

**Cố ý không làm**: đếm lượt lưu cho người đăng (`saves` ở "Tin của tôi" vẫn trống) — TK chưa nói người đăng có được
biết không; báo cho người lưu khi tin đổi giá hay đã bán; lưu tìm kiếm (mục "tìm kiếm đã lưu" của app vẫn là dữ liệu mẫu,
cần một change riêng); trần số tin được lưu (xem Câu hỏi mở).

## Câu hỏi mở

- **Trần số tin đã lưu**: TK 28 không có con số này nên change không đặt trần (luật của `openspec/config.yaml`: không
  tự đặt con số). Nếu muốn chặn lạm dụng thì thêm một khoá vào bảng con số bằng change sau.
- ~~Tin đã bán, hết hạn trong danh sách đã lưu~~ — người dùng chốt 25/10/2026: giữ, kèm trạng thái (design mục 2, bề mặt
  `saved` của luật "ai thấy một tin").

## Capabilities

### New Capabilities

- `listing/saved-listings`: lưu, bỏ lưu, xem lại tin đã lưu.

### Modified Capabilities

_(không có — xoá tài khoản bỏ tin đã lưu được viết ngay trong capability mới, vì chỉ `listing` giữ dữ liệu này)_

## Impact

- **Code**: `listing` (repository, cụm `read`, listener `identity.account.deleted`).
- **API**: thêm bốn route dưới `/me/saved-listings`. Không breaking.
- **Migration**: một bảng mới, không mất dữ liệu, không SQL viết tay.
- **Tài liệu**: TK 15 thêm "tin đã lưu" vào bảng mức hiển thị và đoạn "Tin đã lưu"; TK 29 gỡ mục hoãn; CLAUDE.md thứ
  tự change; `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: `npm run api:sync`, `queries/listings.ts` (lưu, đã lưu), bỏ nhánh tin mẫu.
