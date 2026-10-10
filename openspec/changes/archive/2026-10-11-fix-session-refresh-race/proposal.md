# Proposal

## Why

TK 7 hứa người dùng giữ phiên trên từng thiết bị tới khi họ đăng xuất hay 30 ngày không dùng (giá trị khởi
đầu). Rà soát ngày 10/10/2026 tìm ra một đường làm vỡ lời hứa đó: app mobile thường gửi **hai lượt làm mới
phiên cùng lúc** khi được mở lại (hai request cùng thấy access token hết hạn). Hai lượt cùng đọc phiên, cùng
ghi đè token làm mới; một lượt cầm về token không còn khớp, lượt làm mới kế tiếp của nó nhận 401 dù phiên
vẫn sống — người dùng bị đăng xuất vô cớ. Nếu app gửi lại token cũ để "thử lại", luật phát hiện dùng lại thu
hồi luôn cả phiên.

Việc làm mới phiên (xoay token, phát hiện token bị dùng lại) hiện chỉ nằm trong design của `add-identity`,
chưa có requirement nào trong `identity/sessions` — app không có hợp đồng để dựa vào. Change này viết hợp đồng
đó thành requirement và sửa cuộc đua.

Đợt 1 theo TK 29 (sửa sau rà soát, trước khi `add-groups` bắt đầu dùng phiên của staff và master). Nguyên tắc
TK 4 đứng sau quyết định: **sự tiện lợi** (không đăng xuất người dùng vô cớ) nhưng không đánh đổi an toàn —
token bị dùng lại vẫn thu hồi phiên.

## What Changes

- Requirement mới "Làm mới phiên" trong `identity/sessions`: làm mới bằng token hiện hành cấp cặp token mới
  và token cũ hết dùng được; token đã thay mà còn được gửi lên thì thu hồi cả phiên; hai lượt làm mới cùng lúc
  bằng cùng một token thì đúng một lượt thành công, lượt kia nhận **409 `REFRESH_CONFLICT`** và phiên không bị
  thu hồi vì lượt đó.
- Lượt xoay token thành lượt ghi có điều kiện theo token đang dùng, không còn đọc rồi ghi.
- Mã lỗi mới: 409 `REFRESH_CONFLICT`. Tài liệu route `/auth/refresh` nói rõ hợp đồng cho client: app gom các
  lượt làm mới thành một; nhận 409 thì chờ kết quả lượt đang chạy, không gửi lại token cũ.

**Cố ý chưa làm**: cửa sổ ân hạn cho token vừa thay (gửi lại token cũ trong N giây không bị thu hồi) — đó là
một con số mới phải vào TK 28 trước, và 409 đã cho client tín hiệu đủ rõ để không cần nó. Sẽ xét lại nếu số
đo thật cho thấy client vẫn bị thu hồi phiên vì lý do này.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/sessions`: thêm requirement "Làm mới phiên".

## Impact

- `src/modules/identity`: repository (lượt xoay có điều kiện, bản Prisma và bản giả), service `refresh`, route
  `/auth/refresh` (response 409, mô tả hợp đồng client).
- Không đổi schema DB, không migration, không thêm package.
- Client: thêm một mã lỗi phải xử; app chưa gom lượt làm mới thì nên gom (hợp đồng trong Swagger).
