## ADDED Requirements

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
