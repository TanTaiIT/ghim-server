# Proposal

## Why

TK 23 chia báo cáo theo người xử: báo cáo về tin trong nhóm loại **lừa đảo, hàng cấm** vào hàng staff và "**điều hành
nhóm không thấy báo cáo này**"; báo cáo về một người vào hàng staff việc an toàn. Spec `review/reports` "Ai xử báo cáo"
viết đúng như vậy — hàng của nhóm không có những việc đó. Nhưng màn chi tiết một việc (TK 17 "Người xử thấy… báo cáo
liên quan") dùng chung một hàm dựng cho bàn vận hành và bàn của nhóm: chủ nhóm, điều hành viên mở một việc về tin trong
nhóm mình thì thấy **mười báo cáo gần nhất về người đăng trên toàn sàn** — kể cả báo cáo lừa đảo, hàng cấm đã đóng, báo
cáo về tin ở nhóm khác hay sàn chung, báo cáo về chính người đó — và **đoạn hội thoại riêng** kèm báo cáo về người còn mở.
Đó đúng là điểm mù TK 23 tránh: điều hành viên bao che thành viên, hay đọc tin nhắn riêng của người khác.

Lộ ra khi nối bàn duyệt của chủ nhóm vào `ghim-app`; người dùng chọn sửa ngày 25/10/2026. Không thuộc đợt
nào của TK 29 — sửa cho đúng TK 23, không đổi luật.

## What Changes

- Màn chi tiết một việc ở bàn của nhóm chỉ trả **báo cáo thường về chính tin đó** (mở hay đã đóng). Không có báo cáo lừa
  đảo, hàng cấm, báo cáo về người, báo cáo về tin khác của người đăng; không có đoạn hội thoại nào.
- Bàn vận hành (staff, master) không đổi.

**Cố ý không làm**: lịch sử cảnh cáo, mức tin cậy, tin sạch, tài khoản dùng chung thiết bị và tin cùng ảnh của người đăng
vẫn hiện ở bàn của nhóm — TK 17 cho "người xử" thấy những thứ này, không tách điều hành nhóm ra. Nếu muốn thu hẹp cả
phần đó thì là đổi luật TK 17, change riêng.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `review/reports`: "Người xử thấy báo cáo liên quan" thêm phạm vi của điều hành nhóm.

## Impact

- **Code**: `review` — repository báo cáo thêm truy vấn "báo cáo thường về một tin"; màn chi tiết việc chọn truy vấn theo
  bàn đang xem.
- **API**: `GET /groups/:groupId/review/tasks/:taskId` trả ít báo cáo hơn, `conversations` luôn rỗng. Hình response không
  đổi. Không breaking.
- **Migration**: không.
- **Tài liệu**: TK 17 dòng "Người xử thấy" thêm phạm vi của điều hành nhóm; CLAUDE.md thứ tự change.
- **Client** `ghim-app`: không phải sửa — màn duyệt của chủ nhóm hiện đúng những gì server trả.
