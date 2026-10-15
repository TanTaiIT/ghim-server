# listing/submission Specification

## Purpose

Đưa một nháp sang cho máy duyệt chỉ khi người đăng đủ mọi điều kiện gửi, và báo ngay lý do khi chưa đủ thay vì
tạo ra một tin dở dang (TK 7, TK 12).

## Requirements

### Requirement: Gửi nháp cho máy duyệt

Người đăng SHALL gửi được nháp của mình. Gửi thành công thì tin chuyển sang "đang kiểm" chờ kết quả máy duyệt, và
chưa ai khác thấy tin.

#### Scenario: Gửi thành công

- **WHEN** người đăng đủ mọi điều kiện gửi nháp của mình
- **THEN** tin chuyển sang đang kiểm, và một người khác mở tin nhận HTTP 404 `NOT_FOUND`

#### Scenario: Gửi nháp của người khác

- **WHEN** một người dùng gửi nháp không phải của mình
- **THEN** response có HTTP 404 `NOT_FOUND` và nháp không đổi

### Requirement: Chưa xác nhận email thì không gửi tin

Tài khoản chưa xác nhận email MUST NOT gửi được tin (TK 7). Nháp của tài khoản đó giữ nguyên để gửi sau khi xác
nhận.

#### Scenario: Gửi khi chưa xác nhận email

- **WHEN** tài khoản chưa xác nhận email gửi nháp
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED` và nháp vẫn là nháp

#### Scenario: Gửi sau khi đã xác nhận

- **WHEN** chủ tài khoản đó xác nhận email rồi gửi lại chính nháp ấy
- **THEN** tin chuyển sang đang kiểm

### Requirement: Thiếu điều kiện gửi thì báo ngay, không gửi gì

Mọi điều kiện gửi SHALL được kiểm trước khi tin rời nháp: hạn mức tin sống và nhịp gửi (trust/quotas), không
đang trong thời gian chờ (screening/hard-gates), tin có tiêu đề, giá và ít nhất 1 ảnh, cùng các luật nơi đăng —
danh mục đang bật, đúng tư cách trong nhóm, có tỉnh và phường nếu lên sàn chung. Mô tả không bắt buộc (chốt
12/10/2026). Thiếu điều kiện nào thì MUST báo lỗi ngay kèm lý do, và không tin nào
được gửi.

#### Scenario: Danh mục đang tắt

- **WHEN** người đăng gửi nháp thuộc một danh mục đang tắt
- **THEN** response có HTTP 409 `CATEGORY_DISABLED` nêu lý do, nháp vẫn là nháp, và không tin nào chuyển sang
  đang kiểm

#### Scenario: Thiếu ảnh

- **WHEN** người đăng gửi một nháp có tiêu đề và giá nhưng chưa có ảnh nào
- **THEN** response có HTTP 400 `VALIDATION_ERROR` nêu thiếu ảnh, và nháp vẫn là nháp

#### Scenario: Không có mô tả

- **WHEN** người đăng gửi một nháp đủ mọi điều kiện gửi nhưng để trống mô tả
- **THEN** tin chuyển sang đang kiểm

#### Scenario: Đang trong thời gian chờ

- **WHEN** người đăng gửi nháp lúc đang trong thời gian chờ (xem screening/hard-gates)
- **THEN** response có HTTP 429 `SUBMISSION_COOLDOWN` kèm thời điểm được gửi lại, và nháp vẫn là nháp với
  nguyên nội dung và ảnh

#### Scenario: Gửi lại khi điều kiện đã thoả

- **WHEN** người đăng gửi lại chính nháp đó sau khi điều kiện bị thiếu đã thoả
- **THEN** tin chuyển sang đang kiểm

### Requirement: Bấm Đăng hai lần chỉ ra một tin

Hai lượt gửi cùng một nháp, kể cả gần như cùng lúc vì mạng chậm, MUST chỉ đưa ra đúng một tin đang kiểm (TK 12).
Lượt sau SHALL nhận lại đúng tin của lượt đầu thay vì báo lỗi (chốt 12/10/2026).

#### Scenario: Hai request gửi cùng lúc

- **WHEN** app gửi hai request gửi cùng một nháp gần như đồng thời
- **THEN** chỉ có một tin chuyển sang đang kiểm, không có tin thứ hai, và chỉ một lượt gửi được tính

#### Scenario: Request thứ hai tới sau

- **WHEN** app gửi lại cùng một nháp sau khi lượt đầu đã chuyển tin sang đang kiểm
- **THEN** response có HTTP 200 với đúng tin của lượt đầu, và không lượt gửi nào được tính thêm
