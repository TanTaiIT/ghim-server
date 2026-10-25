# Proposal

## Why

TK 7 cho người dùng tự nguyện nộp giấy tờ, master hoặc staff được giao việc duyệt, "kết quả chỉ được lưu lại". Server có
route nộp và route duyệt, nhưng người nộp không có cách nào đọc lại hồ sơ của mình: nộp xong, màn xác minh của `ghim-app`
không biết hồ sơ đang chờ, đã xác minh hay bị từ chối, và người bị từ chối không biết vì sao — trái nguyên tắc "người dùng
biết vì sao" (TK 4). Lộ ra khi nối màn nộp giấy tờ của app (25/10/2026); người dùng chốt làm cùng ngày.

Không thuộc đợt nào của TK 29 — phần còn thiếu của tính năng phụ ở TK 7. Không đụng cam kết nào ở TK 27; cam kết 32 (kết
quả không ảnh hưởng gì) giữ nguyên.

## What Changes

- `GET /api/v1/me/id-verification` — hồ sơ nộp gần nhất của chính mình: trạng thái chờ duyệt, đã xác minh hay bị từ chối,
  lúc nộp, lúc duyệt, lý do khi bị từ chối. Chưa nộp lần nào → `data: null`.
- Response không có số giấy tờ và không nêu ai duyệt.

**Cố ý không làm**: báo kết quả qua thông báo trong app (người nộp mở lại màn xác minh là thấy; thông báo là change riêng
nếu cần); lịch sử mọi lần nộp (chỉ lần gần nhất); huy hiệu "đã xác minh" trên hồ sơ công khai (TK 7 chỉ nói kết quả được
lưu lại).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/id-verification`: thêm requirement "Người nộp xem được hồ sơ của mình".

## Impact

- **Code**: `identity` — repository đọc hồ sơ gần nhất (thay hàm tìm hồ sơ đang chờ: hồ sơ đang chờ luôn là hồ sơ gần
  nhất, vì chưa duyệt thì không nộp tiếp được), mặt service tài khoản, route `/me`.
- **API**: thêm một route đọc. Không breaking.
- **Migration**: không.
- **Tài liệu**: TK 7 thêm một câu; CLAUDE.md thứ tự change.
- **Client** `ghim-app`: `npm run api:sync`; màn xác minh đọc trạng thái, chỉ hiện form nộp khi chưa nộp hoặc bị từ chối.
