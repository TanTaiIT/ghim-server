# media/image-storage Specification

## Purpose

Giữ mọi ảnh của Ghim trong kho của chính hệ thống, có chủ ngay từ lúc tải và không đổi được ruột sau khi
tải, để điều người duyệt đã xem luôn đúng là điều người mua thấy (TK 25).

## Requirements

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

### Requirement: Chỉ nhận ảnh nằm trong kho

Khi lưu một chủ — hồ sơ, nháp, tin — mọi ảnh SHALL là ảnh nằm trong kho của hệ thống, do chính người lưu tải lên
cho đúng chủ đó. Đường link tới ảnh ngoài kho, ảnh chưa tải xong, ảnh tải cho chủ khác MUST bị từ chối. Ảnh của
người khác MUST bị từ chối giống hệt ảnh không tồn tại.

#### Scenario: Ảnh chưa tải xong

- **WHEN** người dùng đặt ảnh đại diện bằng một ảnh đã xin quyền tải nhưng chưa tải lên kho
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` và ảnh đại diện giữ nguyên như trước

#### Scenario: Ảnh do người khác tải lên

- **WHEN** người dùng đặt ảnh đại diện bằng mã của một ảnh do tài khoản khác tải lên
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`, giống hệt trường hợp mã ảnh không tồn tại

#### Scenario: Ảnh của chính mình trong kho

- **WHEN** người dùng đặt ảnh đại diện bằng ảnh mình đã tải xong cho hồ sơ
- **THEN** hồ sơ được lưu cùng ảnh đó

### Requirement: Ngoại lệ duy nhất là ảnh đại diện lấy từ Google

Ảnh đại diện lấy từ tài khoản Google mà người dùng dùng để đăng nhập SHALL được nhận dù không nằm trong kho.
Đây là ngoại lệ duy nhất: mọi ảnh khác ngoài kho MUST bị từ chối, kể cả ảnh đại diện từ nguồn khác.

#### Scenario: Ảnh đại diện từ tài khoản Google

- **WHEN** người dùng đăng nhập bằng Google dùng ảnh đại diện của tài khoản Google đó làm ảnh đại diện
- **THEN** hồ sơ được lưu với ảnh đó dù ảnh không nằm trong kho

#### Scenario: Ảnh đại diện từ trang khác

- **WHEN** người dùng đặt ảnh đại diện bằng đường link tới một trang không phải kho của hệ thống
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Tài khoản chưa nối Google

- **WHEN** người dùng chưa từng đăng nhập bằng Google chọn dùng ảnh Google làm ảnh đại diện
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`

### Requirement: Nhãn "chưa xác nhận"

Ảnh mới tải SHALL mang nhãn "chưa xác nhận". Nhãn SHALL được gỡ ngay khi chủ của ảnh được lưu thành công
cùng ảnh đó; lần lưu thất bại MUST NOT gỡ nhãn.

#### Scenario: Ảnh vừa tải

- **WHEN** người dùng tải xong một ảnh cho hồ sơ nhưng chưa đặt làm ảnh đại diện
- **THEN** ảnh mang nhãn "chưa xác nhận"

#### Scenario: Lưu thành công

- **WHEN** người dùng đặt ảnh vừa tải làm ảnh đại diện thành công
- **THEN** ảnh hết mang nhãn "chưa xác nhận"

#### Scenario: Lưu thất bại

- **WHEN** người dùng đặt ảnh vừa tải làm ảnh đại diện nhưng lần lưu bị từ chối với HTTP 400 `VALIDATION_ERROR`
- **THEN** ảnh vẫn mang nhãn "chưa xác nhận"

### Requirement: Bản sao ảnh cho tin chuyển lên sàn chung

Khi người đăng chuyển một tin đã rời nhóm lên sàn chung (listing/suspension), mọi ảnh của tin cũ SHALL được chép
thành ảnh mới trong kho, thuộc về tin mới và không mang nhãn "chưa xác nhận". Ảnh của tin cũ MUST giữ nguyên chủ và
nội dung — mỗi ảnh vẫn có đúng một chủ suốt đời (TK 25).

#### Scenario: Chuyển tin có ba ảnh

- **WHEN** người đăng chuyển lên sàn chung một tin có ba ảnh của nhóm đã đóng
- **THEN** tin mới có ba ảnh mới cùng thứ tự, thuộc về tin mới, và ba ảnh của tin cũ vẫn thuộc tin cũ

#### Scenario: Tin cũ bị xoá hẳn sau đó

- **WHEN** tin cũ bị xoá hẳn sau khi đã chuyển lên sàn chung
- **THEN** ảnh của tin mới vẫn còn trong kho

### Requirement: Kho ảnh tạm không trả lời

Khi kho ảnh không trả lời kịp hay đang chặn vì quá trần lượt gọi, thao tác cần tới kho SHALL trả HTTP 503
`STORAGE_UNAVAILABLE` kèm câu báo thử lại sau, không phải 500 `INTERNAL_ERROR`, và MUST NOT lưu gì nửa chừng — người
dùng làm lại y nguyên là được. Kho trả lỗi khác (khoá hay chữ ký sai) vẫn là lỗi hệ thống (chốt 15/10/2026).

#### Scenario: Đặt ảnh đại diện lúc kho không trả lời

- **WHEN** người dùng đặt ảnh đại diện bằng ảnh vừa tải, đúng lúc kho ảnh không trả lời
- **THEN** response có HTTP 503 `STORAGE_UNAVAILABLE`, ảnh đại diện giữ nguyên như trước và ảnh vừa tải vẫn mang
  nhãn "chưa xác nhận"

### Requirement: Phiếu tải ảnh cho biết cạnh ngắn tối thiểu

Phiếu tải ảnh SHALL kèm cạnh ngắn tối thiểu đang áp cho ảnh của tin (`screening/image-checks`), để client chặn ảnh quá
nhỏ trước khi tải lên. Phiếu tải ảnh đại diện SHALL kèm cùng con số, nhưng ảnh đại diện MUST NOT bị kiểm chất lượng.

#### Scenario: Xin tải ảnh cho tin

- **WHEN** người đăng xin tải một ảnh cho bản nháp của mình, cạnh ngắn tối thiểu đang là 480
- **THEN** phiếu tải ảnh cho biết cạnh ngắn tối thiểu 480

#### Scenario: Master đổi ngưỡng

- **WHEN** master đổi cạnh ngắn tối thiểu thành 600 rồi người đăng xin tải ảnh mới
- **THEN** phiếu tải ảnh cho biết cạnh ngắn tối thiểu 600
