## Purpose

Một ví Xu cho mỗi tài khoản, ghi bằng sổ cái không sửa không xoá, để mọi đồng Xu trừ hay cộng đều có dòng người dùng tự
đọc được. Xu không mua bằng tiền: master cấp miễn phí khi người dùng xin (kế hoạch gói đẩy tin, chốt 28/10/2026).

## ADDED Requirements

### Requirement: Số dư là tổng của sổ cái

Mỗi tài khoản SHALL có đúng một ví với số dư Xu không âm, mở bằng 0. Mọi biến động SHALL là một dòng sổ cái mang số Xu
(âm hay dương), loại biến động, số dư sau giao dịch, tham chiếu tới việc gây ra nó và một khoá chống lặp duy nhất. Dòng sổ
cái MUST NOT bị sửa hay xoá; sai thì ghi dòng điều chỉnh ngược dấu. Số dư MUST luôn bằng tổng các dòng.

#### Scenario: Tài khoản mới

- **WHEN** người dùng vừa đăng ký mở ví
- **THEN** số dư là 0 Xu và lịch sử rỗng

#### Scenario: Hai lượt trừ cùng lúc vượt số dư

- **WHEN** ví có 4 Xu và hai lượt trừ 4 Xu tới cùng lúc
- **THEN** đúng một lượt thành công, lượt kia bị từ chối vì thiếu Xu, và số dư là 0 Xu

#### Scenario: Gọi lại cùng khoá chống lặp

- **WHEN** app gửi lại một lượt trừ Xu với cùng khoá chống lặp sau khi mất mạng
- **THEN** sổ cái chỉ có một dòng cho lượt đó và số dư chỉ bị trừ một lần

### Requirement: Người dùng xem ví của mình

Người dùng SHALL xem được số dư và lịch sử biến động của ví mình, mới trước, mỗi dòng nêu loại, số Xu, số dư sau và
việc gây ra nó. Người dùng MUST NOT xem được ví của người khác.

#### Scenario: Xem lịch sử

- **WHEN** người dùng được master cấp 5 Xu rồi mua gói nổi bật 7 ngày giá 4 Xu
- **THEN** lịch sử có hai dòng, mới trước: mua gói −4 (số dư sau 1), cấp +5 (số dư sau 5)

### Requirement: Chỉ master cấp hay trừ Xu

Master SHALL cấp hoặc trừ Xu của một tài khoản kèm lý do bắt buộc; thao tác vào nhật ký bất biến. Trừ quá số dư MUST bị
từ chối. Ngoài master, không ai — kể cả staff — được cấp hay trừ Xu.

#### Scenario: Cấp Xu

- **WHEN** master cấp 5 Xu cho một tài khoản kèm lý do "xin qua Hỗ trợ Ghim"
- **THEN** ví tăng 5 Xu, sổ cái có dòng `admin_adjust`, nhật ký có một dòng ghi master, tài khoản, số Xu và lý do

#### Scenario: Trừ quá số dư

- **WHEN** master trừ 3 Xu của ví đang có 2 Xu
- **THEN** response có HTTP 409 `INSUFFICIENT_BALANCE` và ví không đổi

#### Scenario: Staff cấp Xu

- **WHEN** một staff gọi cấp Xu cho một tài khoản
- **THEN** response có HTTP 403 `FORBIDDEN` và ví không đổi

#### Scenario: Master xem ví trước khi cấp

- **WHEN** master mở ví của một tài khoản đang có 3 Xu
- **THEN** master thấy số dư 3 Xu và các dòng sổ cái gần nhất của ví đó; người dùng khác vẫn không xem được

#### Scenario: Bấm cấp hai lần

- **WHEN** master gửi lại lượt cấp 5 Xu với cùng khoá chống lặp vì mạng chậm
- **THEN** ví chỉ tăng 5 Xu một lần và response trả cùng dòng sổ cái

### Requirement: Xu không quy đổi ra tiền, không hạn sử dụng

Xu MUST NOT mua được bằng tiền, MUST NOT đổi ra tiền và MUST NOT hết hạn.

#### Scenario: Không có đường nạp hay rút

- **WHEN** người dùng tìm cách nạp Xu bằng tiền hay rút Xu ra tiền
- **THEN** không có thao tác nào như vậy (HTTP 404 `NOT_FOUND`)
