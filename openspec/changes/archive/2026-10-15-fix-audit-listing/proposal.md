# Proposal

## Why

Đợt 3 phần A2 của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): tin đăng. Đọc lại ở HEAD bf2faef,
chưa mục nào được sửa:

- **T14** — lượt sửa, gửi lại, gia hạn của người đăng ghi nơi đăng và huy hiệu đọc **trước** khi khoá dòng. Hệ thống hạ
  "nhóm công khai" về "chỉ thành viên" lúc riêng tư hoá, hay gỡ huy hiệu, mà không tăng phiên bản — lượt sửa chen giữa
  ghi đè lại giá trị cũ. Hệ quả: tin "nhóm công khai" trong nhóm đã riêng tư (trái cam kết 22), huy hiệu đã gỡ quay lại.
- **T15** — tắt danh mục hay khoá tài khoản đúng lúc gửi nháp: bên nghe của lượt tắt / khoá bỏ qua nháp, lượt gửi đã
  kiểm trước đó → tin lên mà không mang lý do tạm ẩn.
- **T16** — tin chờ duyệt đã rời nhóm hẳn (nhóm đóng, bị gỡ khỏi nhóm) vẫn tính vào trần tin sống, trái spec "tin tạm
  ẩn không chiếm chỗ"; chuyển nó lên sàn chung tính thêm một tin.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **T14**: lượt ghi của người đăng giữ nơi đăng, nhóm, huy hiệu theo dòng đã khoá khi người đăng không đổi chúng; ô
  người đăng đổi thì theo người đăng (nơi đăng mới vẫn qua luật nơi đăng trong khoá như cũ).
- **T15**: trong transaction của lượt gửi (gửi, gửi lại, gia hạn, chuyển lên sàn chung) giữ `FOR SHARE` dòng tài khoản
  và dòng danh mục rồi kiểm lại: tài khoản không còn hoạt động → 403, danh mục đã tắt → 409 `CATEGORY_DISABLED` (trừ sửa
  tại chỗ trong danh mục cũ, như cũ).
- **T16**: tin sống chỉ gồm tin đang kiểm, chờ duyệt, đang hiển thị **không tạm ẩn** — đúng chữ spec `trust/quotas`.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/editing`: thêm "Lượt ghi của người đăng không đè thay đổi của hệ thống".
- `listing/suspension`: thêm "Gửi tin đúng lúc tắt danh mục hay khoá tài khoản".
- `trust/quotas`: "Tin sống gồm những gì" thêm scenario tin chờ duyệt đã rời nhóm.

## Impact

- **Code**: `listing` (lượt gửi, sửa, lưu nháp, chuyển lên sàn, đếm tin sống), `identity` và `category` (cửa khoá dòng
  trong transaction của `listing`).
- **Migration**: không.
