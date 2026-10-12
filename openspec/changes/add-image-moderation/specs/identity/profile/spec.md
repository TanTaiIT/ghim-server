## ADDED Requirements

### Requirement: Ảnh đại diện qua kiểm ảnh

Ảnh đại diện mới — tải lên hay lấy từ Google — SHALL qua kiểm ảnh nhạy cảm như ảnh của tin đăng, và chỉ hiện trên hồ
sơ công khai khi đã có kết quả kiểm. Ảnh bị nhận là nhạy cảm MUST NOT hiện trên hồ sơ công khai. Ảnh đại diện không
được so trùng.

#### Scenario: Ảnh nhạy cảm

- **WHEN** người dùng đổi ảnh đại diện sang một ảnh bị nhận là nhạy cảm
- **THEN** hồ sơ công khai không hiện ảnh đó

#### Scenario: Ảnh chưa có kết quả kiểm

- **WHEN** người dùng vừa tải lên ảnh đại diện mới và ảnh chưa có kết quả kiểm
- **THEN** hồ sơ công khai chưa hiện ảnh mới

#### Scenario: Ảnh Google

- **WHEN** người dùng đăng ký bằng Google với ảnh đại diện bị nhận là nhạy cảm
- **THEN** hồ sơ công khai không hiện ảnh đó

#### Scenario: Ảnh bình thường

- **WHEN** ảnh đại diện mới đã có kết quả kiểm và không bị nhận là nhạy cảm
- **THEN** hồ sơ công khai hiện ảnh mới
