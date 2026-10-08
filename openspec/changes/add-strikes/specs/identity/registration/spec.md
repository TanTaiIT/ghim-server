## ADDED Requirements

### Requirement: Đăng ký lại bằng cùng email kế thừa gậy còn hiệu lực

Tài khoản mới tạo bằng email hay bằng Google, với email trùng (sau chuẩn hoá) email của một tài khoản đã xoá,
SHALL kế thừa mọi gậy còn hiệu lực của tài khoản đó — kể cả gậy ra sau khi tài khoản đã xoá, khi báo cáo được
xử trên bản lưu — giữ nguyên loại, điểm và ngày hết hạn. Hệ thống SHALL nhận ra email đó bằng một dấu không dò
ngược ra được email gốc.

#### Scenario: Đăng ký lại bằng biến thể của email

- **WHEN** tài khoản `lan@gmail.com` đã xoá còn một gậy thường hết hạn sau 25 ngày nữa, và khách tạo tài khoản
  mới bằng `Lan+moi@gmail.com`
- **THEN** tài khoản mới có gậy thường đó, 1 điểm, với đúng ngày hết hạn cũ

#### Scenario: Đăng ký lại bằng Google

- **WHEN** tài khoản đã xoá còn gậy hiệu lực và khách đăng nhập bằng Google lần đầu với cùng email đó
- **THEN** tài khoản mới được tạo và mang những gậy còn hiệu lực ấy

#### Scenario: Gậy đã hết hạn

- **WHEN** mọi gậy của tài khoản đã xoá đều hết hạn trước khi khách tạo tài khoản mới bằng cùng email
- **THEN** tài khoản mới không có gậy nào

#### Scenario: Gậy ra sau khi tài khoản đã xoá

- **WHEN** `minh@gmail.com` xoá tài khoản lúc đang bị báo cáo, báo cáo được xử đúng kèm một gậy nặng trong 90
  ngày tài khoản ẩn, rồi khách tạo tài khoản mới bằng `minh@gmail.com` khi gậy đó còn hiệu lực
- **THEN** tài khoản mới mang gậy nặng đó, 2 điểm, với đúng ngày hết hạn

### Requirement: Email của tài khoản bị khoá vĩnh viễn không đăng ký được tới khi gỡ khoá

Email của tài khoản bị master khoá vĩnh viễn vì gậy nghiêm trọng SHALL bị từ chối khi đăng ký tới khi master gỡ
khoá, so sau chuẩn hoá, ở cả đăng ký bằng email lẫn bằng Google. Việc chặn MUST NOT tự hết theo thời gian; gỡ
khoá thì email đó SHALL hết bị chặn.

#### Scenario: Đăng ký bằng biến thể của email bị chặn

- **WHEN** `hoa@gmail.com` bị chặn vì khoá vĩnh viễn, không còn thuộc tài khoản nào, và khách đăng ký
  `h.oa+2@gmail.com`
- **THEN** response có HTTP 403 `EMAIL_BANNED` và không tài khoản nào được tạo

#### Scenario: Đăng nhập Google bằng email bị chặn

- **WHEN** khách đăng nhập bằng Google lần đầu với một email đang bị chặn vì khoá vĩnh viễn
- **THEN** response có HTTP 403 `EMAIL_BANNED` và không tài khoản nào được tạo

#### Scenario: Khoá vĩnh viễn đã hơn 2 năm

- **WHEN** `hoa@gmail.com` bị khoá vĩnh viễn hơn 2 năm trước, master chọn giữ tiếp ở lần xem lại, và khách đăng
  ký `hoa@gmail.com`
- **THEN** response có HTTP 403 `EMAIL_BANNED`

#### Scenario: Sau khi master gỡ khoá

- **WHEN** master đã gỡ khoá vĩnh viễn gắn với `hoa@gmail.com` và khách đăng ký `h.oa+2@gmail.com`
- **THEN** lượt đăng ký không bị từ chối với `EMAIL_BANNED`
