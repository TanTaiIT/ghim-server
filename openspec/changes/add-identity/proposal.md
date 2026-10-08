# Proposal

## Why

Mọi phần khác của Ghim cần biết "người này là ai": đăng tin, vào nhóm, duyệt tin, ra gậy đều gắn với một
tài khoản. TK 7 và TK 8 chốt cách có tài khoản — chỉ bằng email, không SMS — và cái giá của lựa chọn đó:
một người nhiều email là nhiều tài khoản, nên hệ thống cần dấu thiết bị để nhận ra các tài khoản dùng
chung một chiếc máy.

Đợt 1 theo TK 29. Cam kết ở TK 27 mà change này đáp ứng: **12** (mỗi email một tài khoản, so sau chuẩn
hoá; không gửi SMS), một phần **13** (tài khoản đang bị khoá không tự xoá được), một phần **28** (tài
khoản master và staff luôn đăng nhập hai lớp), **32** (xác minh giấy tờ không ảnh hưởng gì).

## What Changes

- Đăng ký bằng email + mật khẩu (mã xác nhận gửi qua email) hoặc bằng Google; chặn email dùng một lần;
  chuẩn hoá email trước khi so trùng.
- Đăng nhập, giới hạn số phiên cùng lúc, đăng nhập hai lớp cho master và staff.
- Hồ sơ công khai, số điện thoại tuỳ chọn mang nhãn "chưa xác minh", tên dành riêng.
- Đổi email, khoá / mở khoá tài khoản, tự xoá tài khoản.
- Dấu thiết bị: ghi khi đăng tin, đếm tài khoản đăng tin trên một máy, đánh dấu tài khoản đáng ngờ.
- Xác minh giấy tờ — tính năng phụ, không tham gia luồng chính.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Tài khoản mới ở mức T0 → `add-trust-tiers`.
- Chưa xác nhận email thì không đăng tin / không nhắn tin → `add-listings`, `add-messaging`.
- Tin của người bị khoá / đã xoá tạm ẩn → `add-listings`.
- Tên hiển thị và ảnh đại diện qua bộ lọc; tin bị giữ theo dấu thiết bị và câu báo chung kèm mã tra cứu →
  `add-screening`. Change này chỉ có phía hỗ trợ: nhập mã tra cứu, thấy lý do, gỡ đánh dấu.
- Báo cáo số điện thoại bị dùng sai; có báo cáo mở vẫn xoá được tài khoản, báo cáo vẫn xử trên bản lưu trong 90
  ngày tài khoản ẩn → `add-reports`.
- Gậy theo email (đăng ký lại, đổi email), xoá tài khoản khi có gậy, đánh dấu thiết bị theo gậy →
  `add-strikes`.
- Chủ nhóm phải chuyển chủ trước khi xoá tài khoản → `add-groups`.
- Mọi hạn lưu dữ liệu (tài khoản đã xoá 90 ngày, dấu thiết bị 180 ngày, dấu băm email 2 năm) →
  `add-data-retention`.

## Capabilities

### New Capabilities

- `identity/registration`: tạo tài khoản bằng email hoặc Google, mã xác nhận, chuẩn hoá email, chặn email
  dùng một lần, đăng ký dở dang.
- `identity/sessions`: đăng nhập, giới hạn phiên cùng lúc, đăng nhập hai lớp.
- `identity/profile`: hồ sơ công khai, số điện thoại tuỳ chọn, tên dành riêng.
- `identity/email-change`: đổi email có xác nhận, giới hạn tần suất.
- `identity/account-lock`: master khoá và mở khoá tài khoản.
- `identity/account-deletion`: người dùng tự xoá tài khoản.
- `identity/device-registry`: dấu thiết bị, đếm tài khoản đăng tin trên một máy, đánh dấu tài khoản.
- `identity/id-verification`: xác minh giấy tờ tự nguyện.

### Modified Capabilities

Không có.

## Impact

- Module `identity` (mới). Bàn vận hành dùng thêm `account-lock`, `device-registry`, `id-verification`.
- Nối các package đã cài sẵn: `@fastify/jwt`, `@fastify/cookie`, `argon2`. Thêm biến môi trường cho khoá
  JWT và khoá HMAC băm email (khoá này nằm ngoài DB — CLAUDE.md luật 20).
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): dịch vụ gửi email, cách
  xác minh token Google, ứng dụng tạo mã cho đăng nhập hai lớp, DeviceCheck của Apple.
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Luật mật khẩu (độ dài, chặn mật khẩu phổ biến), quên mật khẩu, đăng xuất, xem và thu hồi thiết bị.
    Gợi ý: làm như booking.
  - Đăng nhập trên thiết bị thứ 21 thì từ chối hay đẩy phiên cũ nhất ra.
  - "Tài khoản thứ 4 trên một máy" xếp theo gì khi một tài khoản cũ quay lại đăng tin. Gợi ý: theo thời
    điểm tài khoản đăng tin lần đầu trên máy đó.
  - Nguồn danh sách miền email dùng một lần (TK 29, câu hỏi mở 2).
  - Trong 90 ngày chờ xoá hẳn, email của tài khoản đã xoá có đăng ký lại được ngay không.
  - Mã tra cứu (TK 8, TK 13, chốt 08/10) sinh theo gì — mỗi tin bị giữ, hay mỗi đánh dấu của tài khoản — và
    module nào cấp. Câu báo chung có từ `add-screening` (đợt 3), nên trước đó người bị đánh dấu chưa có mã để
    gửi hỗ trợ.
