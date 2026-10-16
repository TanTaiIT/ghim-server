## ADDED Requirements

### Requirement: Master không bị xoá hay khoá

Tài khoản master MUST NOT bị xoá — kể cả do chính master — và MUST NOT bị khoá, để hệ thống không bao giờ mất
master (TK 5: không có luồng thay hay bỏ master trong app; chốt 15/10/2026). Thao tác bị từ chối MUST NOT đổi
tài khoản hay phiên nào.

#### Scenario: Master tự xoá tài khoản

- **WHEN** master gọi xoá tài khoản của chính mình
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED`, tài khoản master vẫn hoạt động và các phiên của master
  vẫn dùng được

#### Scenario: Xoá tài khoản master bằng email và mật khẩu

- **WHEN** ai đó gửi yêu cầu xoá tài khoản bằng đúng email và mật khẩu của master
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` và tài khoản master vẫn hoạt động

#### Scenario: Master khoá chính mình

- **WHEN** master khoá tài khoản của chính mình kèm lý do
- **THEN** response có HTTP 409 `CONFLICT`, tài khoản master vẫn hoạt động và các phiên của master vẫn dùng được
