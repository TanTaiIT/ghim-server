## ADDED Requirements

### Requirement: Lỗi tạm thời của kho được kiểm lại ở lượt gửi sau

Ảnh có kết quả lỗi vì kho không trả lời sau mọi lượt thử SHALL được kiểm lại khi một lượt gửi sau dùng nó: lượt đó
chờ kết quả mới như ảnh chưa kiểm. Ảnh lỗi vì tệp không còn hay không đọc được MUST NOT được kiểm lại — lượt gửi
sau giữ cho người ngay như cũ (chốt 15/10/2026).

#### Scenario: Kho trở lại sau lượt lỗi

- **WHEN** việc kiểm một ảnh lỗi vì kho không trả lời, tin bị giữ cho người, rồi kho trả lời lại và người đăng sửa tin gửi lại
- **THEN** ảnh được kiểm lại và kết quả máy của lượt mới tính như ảnh bình thường

#### Scenario: Ảnh không đọc được

- **WHEN** việc kiểm một ảnh lỗi vì tệp không đọc được, rồi người đăng sửa tin gửi lại
- **THEN** lượt mới giữ cho người ngay, ảnh không được kiểm lại
