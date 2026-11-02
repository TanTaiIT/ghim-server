## ADDED Requirements

### Requirement: Công tắc gợi ý theo hoạt động trên hồ sơ của tôi

Hồ sơ của tôi (`GET /me`) SHALL có trường "Gợi ý theo hoạt động" (mặc định bật), và người dùng SHALL đổi được trường này
qua cập nhật hồ sơ. Hồ sơ công khai MUST NOT có trường này.

#### Scenario: Tắt qua cập nhật hồ sơ

- **WHEN** A cập nhật hồ sơ với "Gợi ý theo hoạt động" tắt
- **THEN** `GET /me` của A trả trường đó là tắt

#### Scenario: Hồ sơ công khai

- **WHEN** B mở trang người bán của A
- **THEN** response không có trường "Gợi ý theo hoạt động"
