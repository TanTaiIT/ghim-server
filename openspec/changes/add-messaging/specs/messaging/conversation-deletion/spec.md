## Purpose

Cho mỗi bên tự dọn hội thoại khỏi phía mình — bằng cách xoá hội thoại hay xoá cả tài khoản — mà không xoá mất
hội thoại của người kia (TK 24, TK 7).

## ADDED Requirements

### Requirement: Xoá hội thoại chỉ ẩn ở phía mình

Mỗi bên SHALL xoá được một hội thoại khỏi danh sách hội thoại của mình. Xoá MUST chỉ ẩn hội thoại ở phía người
xoá: bên kia vẫn thấy hội thoại cùng mọi tin nhắn cũ như trước.

#### Scenario: Người mua xoá hội thoại

- **WHEN** người mua xoá một hội thoại
- **THEN** hội thoại không còn trong danh sách hội thoại của người mua, còn người bán vẫn thấy hội thoại với đủ
  mọi tin nhắn cũ

#### Scenario: Cả hai bên cùng xoá

- **WHEN** người mua rồi người bán lần lượt xoá cùng một hội thoại
- **THEN** hội thoại không còn trong danh sách hội thoại của bên nào

### Requirement: Xoá tài khoản ẩn hội thoại phía người xoá

Khi một người xoá tài khoản, mọi hội thoại của người đó SHALL bị ẩn ở phía họ. Bên kia của từng hội thoại MUST
vẫn đọc được hội thoại cùng mọi tin nhắn cũ.

#### Scenario: Người bán xoá tài khoản

- **WHEN** người bán xoá tài khoản trong lúc đang có hội thoại với một người mua
- **THEN** người mua vẫn mở được hội thoại đó và đọc đủ mọi tin nhắn cũ

#### Scenario: Người mua xoá tài khoản

- **WHEN** người mua xoá tài khoản trong lúc đang có hội thoại với một người bán
- **THEN** người bán vẫn mở được hội thoại đó và đọc đủ mọi tin nhắn cũ
