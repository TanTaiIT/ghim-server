## MODIFIED Requirements

### Requirement: Ghi dấu thiết bị khi đăng tin

Mỗi lượt gửi tin SHALL ghi lại dấu thiết bị của máy gửi, gắn với tài khoản gửi. Đăng nhập hay xem tin MUST
NOT được tính vào số tài khoản đăng tin của máy — điện thoại cũ qua tay nhiều chủ, chỉ việc đăng tin mới nói lên ai
đang dùng máy để đăng. Dấu đăng nhập (requirement "Ghi dấu thiết bị khi đăng nhập") chỉ phục vụ luật xung đột lợi ích
và luật người hỏi mua, MUST NOT nuôi đánh dấu nào của capability này.

#### Scenario: Gửi tin từ một máy

- **WHEN** một tài khoản gửi tin từ một máy
- **THEN** máy đó được ghi nhận là đã có tài khoản này đăng tin, kèm thời điểm

#### Scenario: Chỉ đăng nhập, không đăng tin

- **WHEN** một tài khoản chỉ đăng nhập trên máy mà không gửi tin nào
- **THEN** tài khoản đó không được tính vào số tài khoản đăng tin của máy

## ADDED Requirements

### Requirement: Ghi dấu thiết bị khi đăng nhập

Mỗi lượt đăng nhập thành công từ app có gửi mã máy SHALL ghi lại dấu thiết bị của máy đó, gắn với tài khoản, kèm lần
đầu và lần gần nhất. Lượt không gửi mã máy hay bị từ chối MUST NOT ghi gì. Dấu đăng nhập SHALL chỉ dùng để nhận ra tài
khoản dùng chung máy (TK 16, TK 20) và SHALL bị xoá theo cùng hạn lưu với dấu đăng tin.

#### Scenario: Đăng nhập có mã máy

- **WHEN** một tài khoản đăng nhập thành công từ app kèm mã máy
- **THEN** máy đó được ghi nhận là đã có tài khoản này đăng nhập, kèm thời điểm, và không đánh dấu nào được đặt

#### Scenario: Đăng nhập lại cùng máy

- **WHEN** tài khoản đó đăng nhập lần nữa từ cùng máy
- **THEN** dấu giữ lần đầu, cập nhật lần gần nhất, không thêm dòng mới

#### Scenario: Đăng nhập không có mã máy

- **WHEN** một tài khoản đăng nhập mà app không gửi mã máy
- **THEN** không dấu thiết bị nào được ghi

#### Scenario: Sai mật khẩu

- **WHEN** một lượt đăng nhập kèm mã máy bị từ chối vì sai mật khẩu
- **THEN** không dấu thiết bị nào được ghi

#### Scenario: Quá hạn lưu

- **WHEN** dấu đăng nhập có lần gần nhất cũ hơn hạn lưu dữ liệu thiết bị
- **THEN** job hạn lưu xoá dấu đó
