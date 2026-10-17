## Purpose

Cho một người dừng hẳn việc nhắn tin với một người khác — không hội thoại mới, hội thoại cũ ngừng nhận tin — mà
không bên nào biết ai là người chặn (TK 24).

## ADDED Requirements

### Requirement: Chặn một người

Người dùng SHALL chặn được một người dùng khác. Chặn áp cho cả hai chiều và mọi tin của hai người: không bên nào
mở được hội thoại mới với tin của bên kia.

#### Scenario: Người bị chặn mở hội thoại mới

- **WHEN** A đã chặn B và B mở hội thoại mới với một tin đang hiển thị của A
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và không hội thoại nào được tạo

#### Scenario: Người chặn mở hội thoại mới

- **WHEN** A đã chặn B và A mở hội thoại mới với một tin đang hiển thị của B
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và không hội thoại nào được tạo

#### Scenario: Tự chặn mình

- **WHEN** người dùng chặn chính tài khoản của mình
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Chặn một tài khoản không tồn tại

- **WHEN** người dùng chặn một mã tài khoản không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Hội thoại cũ ngừng nhận tin khi có chặn

Khi một bên chặn bên kia, mọi hội thoại đã có giữa hai người SHALL ngừng nhận tin nhắn từ cả hai phía. Tin nhắn
đã có trước lúc chặn vẫn đọc được.

#### Scenario: Người bị chặn gửi tin trong hội thoại cũ

- **WHEN** A chặn B rồi B gửi tin nhắn trong một hội thoại đã có của hai người
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và A không nhận được tin nhắn đó

#### Scenario: Người chặn gửi tin trong hội thoại cũ

- **WHEN** A chặn B rồi A gửi tin nhắn trong một hội thoại đã có của hai người
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và B không nhận được tin nhắn đó

#### Scenario: Chặn từ một hội thoại áp cho mọi hội thoại

- **WHEN** A và B có hai hội thoại về hai tin khác nhau và A chặn B từ một trong hai hội thoại
- **THEN** cả hai hội thoại đều ngừng nhận tin nhắn

#### Scenario: Tin nhắn cũ vẫn đọc được

- **WHEN** A chặn B
- **THEN** cả A và B vẫn đọc được mọi tin nhắn đã có trong các hội thoại của hai người

### Requirement: Không bên nào biết ai chặn

Mọi phản hồi về hội thoại hay lượt nhắn tin bị chặn MUST giống hệt nhau với cả hai bên — cùng HTTP status, cùng
`error.code`, cùng câu báo, cùng trạng thái hội thoại — và MUST NOT nêu bên nào đã chặn. Người bị chặn MUST NOT
được báo là mình bị chặn.

#### Scenario: Hai bên cùng gửi tin sau khi chặn

- **WHEN** A chặn B, rồi A và B lần lượt gửi tin nhắn trong hội thoại chung
- **THEN** hai response giống hệt nhau và không response nào nêu ai đã chặn

#### Scenario: Hai bên cùng xem hội thoại

- **WHEN** A chặn B, rồi A và B lần lượt mở hội thoại chung
- **THEN** cả hai thấy cùng một trạng thái "hội thoại không nhận tin nhắn", không kèm tên người chặn

#### Scenario: Không báo cho người bị chặn

- **WHEN** A chặn B
- **THEN** B không nhận thông báo nào về việc chặn
