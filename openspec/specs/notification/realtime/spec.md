# notification/realtime Specification

## Purpose

Cho app đang mở nhận ngay chuyện vừa xảy ra với người dùng mà không phải hỏi lại máy chủ, và không để ai nghe được
chuyện của người khác (TK 24).

## Requirements

### Requirement: Kết nối realtime bằng phiên đăng nhập

App SHALL nối kênh realtime bằng access token còn hạn của một phiên đang sống. Token sai, token hết hạn, phiên đã
bị thu hồi hay tài khoản bị khoá MUST bị từ chối.

#### Scenario: Token hợp lệ

- **WHEN** app nối kênh realtime bằng access token còn hạn của một phiên đang sống
- **THEN** kết nối được chấp nhận

#### Scenario: Token sai

- **WHEN** app nối kênh realtime bằng một chuỗi không phải access token hợp lệ
- **THEN** kết nối bị từ chối

#### Scenario: Phiên đã đăng xuất

- **WHEN** app nối kênh realtime bằng access token của một phiên đã đăng xuất
- **THEN** kết nối bị từ chối

### Requirement: Chỉ nhận chuyện của chính mình

Mỗi thông báo mới hay vừa được gộp SHALL được đẩy qua realtime tới mọi kết nối đang mở của người nhận, kèm cờ cho
biết có nhắc hay không. Người khác MUST NOT nhận.

#### Scenario: Người nhận mở app trên hai máy

- **WHEN** đơn xin vào nhóm của một người được duyệt trong lúc người đó đang nối realtime trên hai máy
- **THEN** cả hai kết nối nhận thông báo đó, kèm cờ nhắc đang bật

#### Scenario: Người khác đang nối

- **WHEN** đơn của người A được duyệt trong lúc người B cũng đang nối realtime
- **THEN** kết nối của B không nhận gì về thông báo của A

### Requirement: Kết nối bị cắt khi mất quyền

Khi tài khoản bị khoá hoặc bị xoá, mọi kết nối realtime của nó SHALL bị cắt ngay. Khi một phiên bị thu hồi, kết nối
của đúng phiên đó SHALL bị cắt. Khi access token của kết nối hết hạn, kết nối SHALL bị cắt để app nối lại bằng token
mới.

#### Scenario: Tài khoản bị khoá

- **WHEN** master khoá một tài khoản đang nối realtime
- **THEN** mọi kết nối realtime của tài khoản đó bị cắt

#### Scenario: Đăng xuất một máy

- **WHEN** người dùng đang nối realtime trên hai máy và thu hồi phiên của máy thứ hai
- **THEN** chỉ kết nối của máy thứ hai bị cắt

#### Scenario: Token hết hạn

- **WHEN** access token dùng để nối realtime hết hạn
- **THEN** kết nối bị cắt

### Requirement: Báo hiệu để app tải lại

Kênh realtime SHALL báo hiệu — không kèm dữ liệu chi tiết — khi số chưa đọc của người nhận đổi, khi tư cách hay vai
của người nhận trong một nhóm đổi, và khi số đơn xin vào đang chờ của nhóm người nhận đang quản trị đổi.

#### Scenario: Đọc trên máy khác

- **WHEN** người dùng đánh dấu đã đọc một thông báo trên máy A trong lúc máy B đang nối realtime
- **THEN** máy B nhận số chưa đọc mới

#### Scenario: Tư cách trong nhóm đổi

- **WHEN** đơn xin vào nhóm của người dùng được duyệt
- **THEN** kết nối của người đó nhận báo hiệu danh sách nhóm của mình đã đổi

#### Scenario: Có đơn mới

- **WHEN** một người gửi đơn vào nhóm
- **THEN** kết nối của chủ nhóm nhận số đơn đang chờ mới của nhóm đó
