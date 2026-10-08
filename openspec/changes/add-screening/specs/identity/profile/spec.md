## ADDED Requirements

### Requirement: Tên hiển thị qua bộ lọc cụm từ cấm

Tên hiển thị SHALL qua cùng bộ lọc cụm từ cấm như tin đăng, với cùng cách so khớp (ranh giới chữ, không phân
biệt dấu, ghép chữ cái tách rời, ngoại lệ). Tên chứa cụm mức chắc đang bật MUST NOT hiện trên hồ sơ công
khai (TK 7).

#### Scenario: Đặt tên chứa cụm mức chắc

- **WHEN** "bán súng" là cụm mức chắc đang bật và người dùng đổi tên hiển thị thành "Bán Súng Giá Rẻ"
- **THEN** hồ sơ công khai không hiện tên mới đó

#### Scenario: Lách bằng chữ cái tách rời

- **WHEN** "bán súng" là cụm mức chắc đang bật và người dùng đổi tên hiển thị thành "b á n s ú n g"
- **THEN** hồ sơ công khai không hiện tên mới đó

#### Scenario: Cụm đang chạy thử

- **WHEN** "bán súng" là cụm mức chắc đang chạy thử và người dùng đổi tên hiển thị thành "Bán Súng Giá Rẻ"
- **THEN** hồ sơ công khai hiện tên mới

#### Scenario: Tên bình thường

- **WHEN** người dùng đổi tên hiển thị thành một tên không trúng cụm nào
- **THEN** hồ sơ công khai hiện tên mới

### Requirement: Ảnh đại diện qua kiểm ảnh

Ảnh đại diện mới tải lên SHALL qua kiểm ảnh nhạy cảm như ảnh của tin đăng, và chỉ hiện trên hồ sơ công khai
khi đã có kết quả kiểm. Ảnh bị nhận là nhạy cảm MUST NOT hiện trên hồ sơ công khai.

#### Scenario: Ảnh nhạy cảm

- **WHEN** người dùng đổi ảnh đại diện sang một ảnh bị nhận là nhạy cảm
- **THEN** hồ sơ công khai không hiện ảnh đó

#### Scenario: Ảnh chưa có kết quả kiểm

- **WHEN** người dùng vừa tải lên ảnh đại diện mới và ảnh chưa có kết quả kiểm
- **THEN** hồ sơ công khai chưa hiện ảnh mới

#### Scenario: Ảnh bình thường

- **WHEN** ảnh đại diện mới đã có kết quả kiểm và không bị nhận là nhạy cảm
- **THEN** hồ sơ công khai hiện ảnh mới
