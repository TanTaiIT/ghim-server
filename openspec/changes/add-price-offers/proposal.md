# Proposal

## Why

App Ghim (`ghim-app`) đã có màn chat với **trả giá**: người mua gửi một giá, người bán bấm chấp nhận hay từ chối,
giá mới thay giá đang chờ. Server chưa có gì cho việc đó: TK 24 chỉ nói tin nhắn là chữ, và hội thoại server trả về chỉ
có mã và tiêu đề của tin cùng tên người kia — app không vẽ được thẻ tin đầu hội thoại (ảnh bìa, giá) hay ảnh đại diện.
Lộ ra khi nối app với server ngày 18/10/2026.

Người dùng chốt ngày 18/10/2026:

- **Chỉ người mua trả giá**; người bán chấp nhận hoặc từ chối. Giá mới thay giá đang chờ — mỗi lúc một giá được bàn.
- **Chấp nhận chỉ là ghi nhận trong hội thoại**: tin không đổi trạng thái, không bị giữ, giá đăng không đổi. Ghim nối
  người bán với người mua — không giữ tiền, không giao hàng (TK phần 1) — nên "chấp nhận" là lời hai bên nói với nhau,
  không phải một giao dịch hệ thống phải bảo đảm.

Thuộc đợt 6 của TK 29 (nhắn tin). Change giữ nguyên các luật đã có của TK 24 — chặn, người ngoài nhận "không tìm
thấy", hạn mức hội thoại mới — và cam kết 31 (hạn lưu): đề nghị giá là một tin nhắn, đi theo hạn lưu của hội thoại.

## What Changes

- Người mua gửi được **đề nghị giá** trong hội thoại về một tin đang hiển thị, cho thương lượng, có giá lớn hơn 0; giá
  trả từ 1 đồng tới giá đăng. Đề nghị nằm trong dòng tin nhắn như một tin nhắn, kèm trạng thái.
- Mỗi hội thoại có **tối đa một đề nghị đang chờ**: đề nghị mới làm đề nghị đang chờ thành "đã thay".
- Người bán **chấp nhận** hay **từ chối** đề nghị đang chờ khi tin còn hiển thị. Chấp nhận không đổi gì trên tin.
- Bên kia được báo đề nghị mới và câu trả lời qua hộp thư nhóm "tin nhắn" và kênh realtime, như tin nhắn.
- Hội thoại cho biết thêm **giá, có cho thương lượng không, trạng thái và ảnh bìa** của tin, **ảnh đại diện** người
  kia, và người xem lúc này **có trả giá được không**.
- TK 24 thêm luật trả giá (sửa trong cùng lượt với change này).

**Cố ý chưa làm**:

- Người bán trả giá ngược, mặc cả qua lại — người dùng chọn chỉ người mua trả.
- Giữ tin, ẩn tin hay đổi giá đăng khi chấp nhận — chấp nhận chỉ là ghi nhận.
- Người mua rút lại đề nghị, đề nghị tự hết hạn theo thời gian — gửi giá mới là cách đổi ý.
- Giới hạn số lần trả giá — mỗi đề nghị là một tin nhắn, theo luật của tin nhắn (xem design, Risks).

## Capabilities

### New Capabilities

- `messaging/price-offers`: người mua trả giá trong hội thoại về tin, một đề nghị đang chờ mỗi hội thoại, người bán
  chấp nhận hay từ chối, chấp nhận chỉ ghi nhận.

### Modified Capabilities

- `messaging/conversations`: thêm "Hội thoại cho biết tin và người kia" (giá, thương lượng, trạng thái, ảnh bìa của tin;
  ảnh đại diện người kia; người xem có trả giá được không).
- `notification/inbox`: thêm "Báo đề nghị giá và câu trả lời".

## Impact

- **Code**: module `messaging` (tin nhắn có loại "đề nghị giá", route trả giá và trả lời, DTO hội thoại), cổng sang
  `listing` (dữ liệu thẻ tin cho hội thoại) và `identity` (ảnh đại diện), bảng câu thông báo tin nhắn của
  `notification`.
- **API**: `POST /me/conversations/{id}/offers`, `POST /me/conversations/{id}/offers/{messageId}/accept`, `…/decline`;
  tin nhắn và hội thoại có thêm trường (thêm, không bỏ trường nào).
- **Migration**: thêm cột và enum vào bảng tin nhắn, không mất dữ liệu; CHECK và partial unique viết tay.
- **Tài liệu**: TK 24, `docs/messaging.md`, CLAUDE.md.
- **Client**: `ghim-app` sinh lại SDK rồi nối màn chat — việc của repo app.
