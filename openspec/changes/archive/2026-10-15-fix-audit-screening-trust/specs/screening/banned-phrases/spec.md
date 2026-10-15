## ADDED Requirements

### Requirement: Đổi cụm mức chắc đang bật cũng quét lại

Cụm đang bật được nâng lên mức chắc, hay cụm mức chắc đang bật bị thu hẹp ngoại lệ, SHALL quét lại tin đang hiển
thị như lúc bật thật, kể cả lượt quét lần hai. Bấm bật lại một cụm mức chắc đang bật SHALL quét lại, để lượt quét
lỡ vì lỗi được làm lại (chốt 15/10/2026).

#### Scenario: Nâng cụm đang bật lên mức chắc

- **WHEN** cụm "hàng cấm xuất" đang bật ở mức mơ hồ được master nâng lên mức chắc, và một tin đang hiện chứa cụm đó
- **THEN** tin chuyển sang chờ duyệt

#### Scenario: Bỏ ngoại lệ

- **WHEN** cụm "bán súng" mức chắc đang bật có ngoại lệ "bán súng nước", master bỏ ngoại lệ, và một tin đang hiện ghi "bán súng nước"
- **THEN** tin chuyển sang chờ duyệt

#### Scenario: Bật lại cụm đang bật

- **WHEN** lượt quét lúc bật một cụm mức chắc không chạy được, rồi master bấm bật lại cụm đó
- **THEN** tin đang hiện chứa cụm chuyển sang chờ duyệt và cụm vẫn bật
