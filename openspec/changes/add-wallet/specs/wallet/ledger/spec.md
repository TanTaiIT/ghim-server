## Purpose

Một ví Xu cho mỗi tài khoản, ghi bằng sổ cái không sửa không xoá, để mọi đồng Xu trừ hay cộng đều có dòng người dùng tự
đọc được (TK 29 hoãn; kế hoạch gói đẩy tin bước 1).

## ADDED Requirements

### Requirement: Số dư là tổng của sổ cái

Mỗi tài khoản SHALL có đúng một ví với số dư Xu không âm. Mọi biến động SHALL là một dòng sổ cái mang số Xu (âm hay
dương), loại biến động, số dư sau giao dịch, tham chiếu tới việc gây ra nó và một khoá chống lặp duy nhất. Dòng sổ cái
MUST NOT bị sửa hay xoá; sai thì ghi dòng điều chỉnh ngược dấu. Số dư MUST luôn bằng tổng các dòng.

#### Scenario: Hai lượt trừ cùng lúc vượt số dư

- **WHEN** ví có 10 Xu và hai lượt trừ 8 Xu tới cùng lúc
- **THEN** đúng một lượt thành công, lượt kia bị từ chối vì thiếu Xu, và số dư là 2 Xu

#### Scenario: Gọi lại cùng khoá chống lặp

- **WHEN** app gửi lại một lượt trừ Xu với cùng khoá chống lặp sau khi mất mạng
- **THEN** sổ cái chỉ có một dòng cho lượt đó và số dư chỉ bị trừ một lần

### Requirement: Người dùng xem ví của mình

Người dùng SHALL xem được số dư và lịch sử biến động của ví mình, mới trước, mỗi dòng nêu loại, số Xu, số dư sau và
việc gây ra nó. Người dùng MUST NOT xem được ví của người khác.

#### Scenario: Xem lịch sử

- **WHEN** người dùng được master cấp 50 Xu rồi mua một gói 20 Xu
- **THEN** lịch sử có hai dòng, mới trước: mua gói −20 (số dư sau 30), cấp +50 (số dư sau 50)

### Requirement: Master cấp hay trừ Xu kèm lý do

Master SHALL cấp hoặc trừ Xu của một tài khoản kèm lý do bắt buộc; thao tác vào nhật ký bất biến. Trừ quá số dư MUST bị
từ chối.

#### Scenario: Cấp Xu

- **WHEN** master cấp 100 Xu cho một tài khoản kèm lý do "khai trương"
- **THEN** ví tăng 100 Xu, sổ cái có dòng `promo_grant`, nhật ký có một dòng ghi master, tài khoản, số Xu và lý do

#### Scenario: Trừ quá số dư

- **WHEN** master trừ 30 Xu của ví đang có 20 Xu
- **THEN** response có HTTP 409 `INSUFFICIENT_BALANCE` và ví không đổi

### Requirement: Xu một chiều, không hạn sử dụng

Xu MUST NOT đổi ngược ra tiền và MUST NOT hết hạn.

#### Scenario: Không có đường rút

- **WHEN** người dùng tìm cách rút Xu ra tiền
- **THEN** không có thao tác nào như vậy (HTTP 404 `NOT_FOUND`)
