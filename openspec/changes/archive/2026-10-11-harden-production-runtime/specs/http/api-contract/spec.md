## MODIFIED Requirements

### Requirement: Mã truy vết request

Mỗi response SHALL mang header `x-request-id`: giữ nguyên giá trị client gửi lên khi giá trị đó dài tối đa 128 ký
tự và chỉ gồm chữ cái Latin, chữ số và các ký tự `.` `_` `:` `-`; ngược lại, hoặc khi client không gửi, response
mang một UUID mới. Giá trị sai định dạng MUST NOT xuất hiện trong response hay trong log.

#### Scenario: Client gửi sẵn mã truy vết

- **WHEN** client gửi header `x-request-id: dau-vet-tu-ngoai`
- **THEN** response mang đúng header `x-request-id: dau-vet-tu-ngoai`

#### Scenario: Client không gửi mã truy vết

- **WHEN** client không gửi header `x-request-id`
- **THEN** response mang header `x-request-id` là một UUID mới

#### Scenario: Mã truy vết quá dài

- **WHEN** client gửi header `x-request-id` dài 129 ký tự
- **THEN** response mang header `x-request-id` là một UUID mới, không phải giá trị client gửi

#### Scenario: Mã truy vết có ký tự lạ

- **WHEN** client gửi header `x-request-id: abc<script>`
- **THEN** response mang header `x-request-id` là một UUID mới
