## MODIFIED Requirements

### Requirement: Xin tải ảnh cho một chủ của mình

Người dùng đã đăng nhập SHALL xin được quyền tải đúng một ảnh thẳng vào kho của hệ thống cho một chủ của chính
mình: hồ sơ của mình, một tin của mình kể cả tin còn là nháp (tin nối vào từ `add-listings`), hay một hội thoại mình
đang ở trong (`messaging/message-images`). Quyền tải cấp cho
đúng người xin, và ảnh tải lên thuộc về chủ đã nêu ngay từ lúc tải. Một ảnh có đúng một chủ suốt đời.

#### Scenario: Xin tải ảnh cho hồ sơ của mình

- **WHEN** người dùng xin tải một ảnh JPEG cho hồ sơ của mình
- **THEN** response có HTTP 201 kèm quyền tải lên cho đúng một ảnh, và ảnh tải xong thuộc về hồ sơ đó

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập xin tải ảnh
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Hồ sơ của người khác

- **WHEN** người dùng xin tải ảnh cho hồ sơ của một tài khoản khác
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi chủ đó không tồn tại

#### Scenario: Hội thoại mình không ở trong

- **WHEN** người dùng xin tải ảnh cho một hội thoại giữa hai người khác
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi hội thoại không tồn tại
