## MODIFIED Requirements

### Requirement: Gửi và đọc tin nhắn

Mỗi bên của hội thoại SHALL gửi được tin nhắn cho bên kia — chữ, ảnh (`messaging/message-images`) hay cả hai — và đọc
được mọi tin nhắn của hội thoại theo thứ tự gửi.

#### Scenario: Gửi tin nhắn

- **WHEN** người mua gửi một tin nhắn trong hội thoại của mình
- **THEN** response có HTTP 201 và người bán thấy tin nhắn đó khi mở hội thoại

#### Scenario: Tin nhắn rỗng

- **WHEN** một bên gửi tin nhắn không có chữ và không có ảnh
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không tin nhắn nào được thêm
