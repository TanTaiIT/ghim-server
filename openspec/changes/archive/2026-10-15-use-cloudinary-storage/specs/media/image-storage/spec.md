## MODIFIED Requirements

### Requirement: Giới hạn của một lượt tải

Kho SHALL chỉ nhận ảnh JPEG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB, đúng cỡ đã khai lúc xin. Quyền tải SHALL chỉ dùng
được trong 15 phút; mỗi tài khoản xin tối đa 120 lượt mỗi giờ (cả ba con số là giá trị khởi đầu). Ảnh sai cỡ hay sai
loại MUST bị từ chối — ngay ở kho, hoặc ở bước xác nhận ảnh khi kho không tự ràng được — và MUST NOT dùng được cho chủ
nào. Khi kho là Cloudinary, hạn quyền tải là hạn chữ ký của Cloudinary — 1 giờ (chốt 14/10/2026).

#### Scenario: Tệp không phải ảnh

- **WHEN** người dùng xin tải một tệp khai là văn bản, không phải ảnh
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không có quyền tải nào được cấp

#### Scenario: Ảnh quá dung lượng

- **WHEN** người dùng xin tải một ảnh khai nặng 6 MB
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không có quyền tải nào được cấp

#### Scenario: Quá số lượt xin trong một giờ

- **WHEN** người dùng xin tải lượt thứ 121 trong vòng một giờ
- **THEN** response có HTTP 429 `UPLOAD_LIMIT` và không có quyền tải nào được cấp

#### Scenario: Tải đúng cỡ đã khai

- **WHEN** người dùng tải lên một tệp nặng hơn dung lượng đã khai lúc xin, rồi đặt ảnh đó làm ảnh đại diện
- **THEN** lượt tải bị kho từ chối, hoặc lần đặt ảnh nhận HTTP 400 `IMAGE_NOT_IN_STORAGE`; không ảnh nào dùng được

#### Scenario: Quyền tải quá hạn

- **WHEN** người dùng tải lên bằng một quyền tải đã quá 15 phút (kho Cloudinary: quá 1 giờ)
- **THEN** kho từ chối lượt tải và không có ảnh nào được ghi

### Requirement: Ảnh đã tải không bị ghi đè

Mỗi quyền tải lên SHALL chỉ dùng được cho đúng một ảnh. Ảnh đã nằm trong kho MUST NOT bị ghi đè nội dung —
muốn đổi ảnh thì tải ảnh mới — để không ai đổi được ruột ảnh sau khi tin đã qua duyệt. Kho không báo lỗi cho lượt tải
lại (Cloudinary) vẫn MUST giữ nguyên nội dung cũ (chốt 14/10/2026).

#### Scenario: Dùng lại quyền tải để thay ruột ảnh

- **WHEN** người dùng dùng lại quyền tải của một ảnh đã tải xong để tải một nội dung khác
- **THEN** ảnh trong kho giữ nguyên nội dung cũ, dù lượt tải lại bị từ chối hay không

#### Scenario: Đổi ảnh đại diện

- **WHEN** người dùng thay ảnh đại diện bằng một ảnh khác
- **THEN** ảnh thay vào là một ảnh mới tải vào kho, và nội dung ảnh cũ trong kho không đổi

## ADDED Requirements

### Requirement: Kho ảnh tạm không trả lời

Khi kho ảnh không trả lời kịp hay đang chặn vì quá trần lượt gọi, thao tác cần tới kho SHALL trả HTTP 503
`STORAGE_UNAVAILABLE` kèm câu báo thử lại sau, không phải 500 `INTERNAL_ERROR`, và MUST NOT lưu gì nửa chừng — người
dùng làm lại y nguyên là được. Kho trả lỗi khác (khoá hay chữ ký sai) vẫn là lỗi hệ thống (chốt 15/10/2026).

#### Scenario: Đặt ảnh đại diện lúc kho không trả lời

- **WHEN** người dùng đặt ảnh đại diện bằng ảnh vừa tải, đúng lúc kho ảnh không trả lời
- **THEN** response có HTTP 503 `STORAGE_UNAVAILABLE`, ảnh đại diện giữ nguyên như trước và ảnh vừa tải vẫn mang
  nhãn "chưa xác nhận"
