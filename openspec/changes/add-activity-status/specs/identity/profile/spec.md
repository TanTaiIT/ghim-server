## ADDED Requirements

### Requirement: Công tắc hiện trạng thái hoạt động

Người dùng SHALL bật tắt được việc hiện trạng thái hoạt động của mình trong hội thoại (`messaging/activity-status`). Tài
khoản mới MUST bật sẵn. Xoá tài khoản MUST xoá luôn mốc hoạt động lần cuối của tài khoản đó (cam kết 31).

#### Scenario: Mặc định bật

- **WHEN** một người dùng mới đăng ký xem hồ sơ của mình
- **THEN** hồ sơ cho biết trạng thái hoạt động đang hiện

#### Scenario: Tắt

- **WHEN** người dùng tắt hiện trạng thái hoạt động
- **THEN** response có HTTP 200 và hồ sơ của người dùng cho biết trạng thái hoạt động đang tắt

#### Scenario: Giá trị sai

- **WHEN** người dùng gửi công tắc không phải đúng / sai
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và công tắc không đổi

#### Scenario: Xoá tài khoản

- **WHEN** người dùng tự xoá tài khoản
- **THEN** mốc hoạt động lần cuối của tài khoản không còn lưu
