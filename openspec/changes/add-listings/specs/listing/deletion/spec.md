## Purpose

Cho người đăng tự rút tin của mình khỏi Ghim bằng một luật chung cho mọi trạng thái: xoá mềm, tin biến khỏi mọi
nơi người khác xem (TK 19).

## ADDED Requirements

### Requirement: Người đăng xoá mềm tin của mình

Người đăng SHALL xoá được tin của mình ở mọi trạng thái, kể cả nháp. Xoá là xoá mềm: tin đã xoá MUST NOT hiện
với ai ở bất kỳ đâu, và người đăng không còn sửa, gia hạn hay gửi lại nó được.

#### Scenario: Xoá tin đang hiển thị

- **WHEN** người đăng xoá một tin đang hiển thị
- **THEN** người khác mở tin nhận HTTP 404 `NOT_FOUND`, và tin không còn trên bảng tin, trong tìm kiếm hay
  trên hồ sơ

#### Scenario: Xoá tin chờ duyệt

- **WHEN** người đăng xoá một tin đang chờ duyệt
- **THEN** tin bị xoá

#### Scenario: Xoá nháp

- **WHEN** người đăng xoá một nháp
- **THEN** nháp không còn trong danh sách tin của người đăng

#### Scenario: Thao tác trên tin đã xoá

- **WHEN** người đăng sửa hoặc gia hạn một tin mình đã xoá
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Chỉ người đăng xoá được tin

Người dùng khác MUST NOT xoá được tin không phải của mình.

#### Scenario: Người khác xoá tin đang hiển thị

- **WHEN** một người dùng xoá một tin đang hiển thị của người khác
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn hiển thị

#### Scenario: Người khác xoá nháp

- **WHEN** một người dùng xoá nháp của người khác
- **THEN** response có HTTP 404 `NOT_FOUND` và nháp không đổi
