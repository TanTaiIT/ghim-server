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

### Requirement: Tên bị lọc hiện bằng tên chung

Tên hiển thị không qua bộ lọc SHALL hiện với người khác là "Người dùng Ghim" ở mọi chỗ hiện tên; chủ tài khoản SHALL
vẫn thấy tên mình kèm lời nhắc đổi tên. Cụm mức mơ hồ MUST NOT có tác dụng với tên hiển thị (chốt 12/10/2026).

#### Scenario: Người khác xem hồ sơ

- **WHEN** "bán súng" là cụm mức chắc đang bật và một người dùng có tên hiển thị "Bán Súng Giá Rẻ"
- **THEN** người khác mở hồ sơ thấy tên "Người dùng Ghim", còn chủ tài khoản thấy tên mình kèm lời nhắc đổi tên

#### Scenario: Tên chứa cụm mơ hồ

- **WHEN** tên hiển thị của một người dùng chứa một cụm mức mơ hồ đang bật
- **THEN** hồ sơ công khai hiện đúng tên đó
