## ADDED Requirements

### Requirement: Hội thoại về tin cho biết người kia đang hoạt động

Hội thoại về tin SHALL cho người xem biết người kia đang hoạt động — đang mở app và nối với Ghim — hay không, và lần cuối
họ hoạt động, làm tròn tới phút. Lần cuối hoạt động cũ hơn số ngày của bảng con số — 7 ngày (giá trị khởi đầu) — MUST
NOT hiện (chốt 18/10/2026).

#### Scenario: Người kia đang mở app

- **WHEN** người bán đang mở app và người mua xem hội thoại với người bán
- **THEN** hội thoại cho biết người bán đang hoạt động

#### Scenario: Người kia vừa thoát

- **WHEN** người bán đóng app lúc 9 giờ 41 phút 30 giây và người mua xem hội thoại lúc 9 giờ 50
- **THEN** hội thoại cho biết người bán không hoạt động, lần cuối hoạt động lúc 9 giờ 41

#### Scenario: Lâu rồi không hoạt động

- **WHEN** người bán hoạt động lần cuối 8 ngày trước và người mua xem hội thoại với người bán
- **THEN** hội thoại cho biết người bán không hoạt động và không có lần cuối hoạt động

#### Scenario: Người kia chưa từng mở app

- **WHEN** người bán chưa từng nối realtime và người mua xem hội thoại với người bán
- **THEN** hội thoại cho biết người bán không hoạt động và không có lần cuối hoạt động

### Requirement: Chỉ bên kia của hội thoại về tin thấy

Trạng thái hoạt động SHALL chỉ hiện cho bên kia của một hội thoại về tin. Hồ sơ công khai, tin đăng, nhóm và hội thoại
với một đội MUST NOT cho biết trạng thái hoạt động của ai. Có chặn giữa hai người, hay người kia đã xoá tài khoản, thì
MUST NOT hiện trạng thái hoạt động.

#### Scenario: Hồ sơ công khai

- **WHEN** một người xem hồ sơ công khai của người bán đang mở app
- **THEN** hồ sơ không cho biết người bán đang hoạt động hay lần cuối hoạt động

#### Scenario: Có chặn giữa hai bên

- **WHEN** người bán đã chặn người mua và người mua xem hội thoại chung
- **THEN** hội thoại không cho biết trạng thái hoạt động của người bán, và người bán cũng không thấy của người mua

#### Scenario: Người kia đã xoá tài khoản

- **WHEN** người bán đã xoá tài khoản và người mua xem hội thoại với họ
- **THEN** hội thoại không cho biết trạng thái hoạt động nào

#### Scenario: Hội thoại với quản trị nhóm

- **WHEN** chủ nhóm xem hội thoại của một người dùng đang mở app với quản trị nhóm mình
- **THEN** hội thoại không cho biết người dùng đó đang hoạt động hay lần cuối hoạt động

### Requirement: Tắt trạng thái hoạt động là tắt hai chiều

Người đã tắt hiện trạng thái hoạt động SHALL không để ai thấy trạng thái của mình, và MUST NOT thấy trạng thái hoạt động
của người khác — không ai giấu được mình mà vẫn xem được người khác.

#### Scenario: Người bán tắt

- **WHEN** người bán đã tắt hiện trạng thái hoạt động, đang mở app, và người mua xem hội thoại với người bán
- **THEN** hội thoại không cho biết người bán đang hoạt động hay lần cuối hoạt động

#### Scenario: Người tắt không thấy người khác

- **WHEN** người mua đã tắt hiện trạng thái hoạt động và xem hội thoại với một người bán đang mở app, chưa tắt
- **THEN** hội thoại không cho biết trạng thái hoạt động của người bán

#### Scenario: Bật lại

- **WHEN** người mua bật lại hiện trạng thái hoạt động rồi xem hội thoại với người bán đang mở app
- **THEN** hội thoại cho biết người bán đang hoạt động
