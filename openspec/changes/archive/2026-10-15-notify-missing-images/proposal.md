# Proposal

## Why

TK 25: "Mỗi tháng đối chiếu cả kho để vét ảnh lọt lưới; ảnh đang dùng mà mất khỏi kho thì **báo cho chủ của nó**, không
tự sửa tin." `add-media` (11/10/2026) mới làm nửa đầu: lượt đối chiếu hằng tháng (TK 26) tìm ra ảnh mất và phát sự kiện
`media.image.missing`, nhưng chưa module nào nghe sự kiện đó — người đăng không biết tin của mình đang thiếu ảnh, người
dùng không biết ảnh đại diện đã hỏng. Rà soát kho ảnh ngày 15/10/2026 tìm ra lỗ hổng này; người dùng yêu cầu vá.

Hạ tầng đi theo đợt 2 (ảnh), không thuộc đợt mới nào của TK 29.

## What Changes

- Ảnh của tin đang dùng mà mất khỏi kho → người đăng nhận thông báo nhóm "tin đăng của bạn", có nhắc, mời mở tin để
  thay ảnh khác. Nhiều ảnh của cùng một tin mất trong một lượt thì gộp thành một dòng chưa đọc ("2 ảnh của tin …").
- Ảnh đại diện đang dùng mà mất khỏi kho → chủ tài khoản nhận thông báo nhóm "tài khoản" (luôn bật), có nhắc, mời chọn
  ảnh khác.
- Tin người đăng đã xoá thì không báo. Lượt đối chiếu tháng sau còn thấy ảnh mất thì báo lại.
- Tin và hồ sơ vẫn không bị sửa (TK 25 "không tự sửa tin") — người dùng tự thay ảnh.

**Cố ý chưa làm**: tự gỡ ảnh mất khỏi tin hay hạn chế tin thiếu ảnh — TK 25 cấm tự sửa tin; muốn đổi thì sửa TK trước.

## Capabilities

### Modified Capabilities

- `media/image-cleanup`: requirement "Đối chiếu kho ảnh hằng tháng" — ảnh mất được **báo** cho chủ, không chỉ ghi
  nhận.

## Impact

- `notification`: dòng ma trận mới N38 (ảnh tin), N39 (ảnh đại diện) cho sự kiện `media.image.missing`; nghe thêm sự
  kiện đó.
- `listing`: cổng đọc trả người đăng và tiêu đề của tin chưa xoá cho `notification` (TK 30: `notification` không đọc
  bảng `listings`).
- `media`: không đổi — sự kiện đã mang mã ảnh, loại chủ, mã chủ.
- Không đổi DB, không migration, không thêm thư viện.
