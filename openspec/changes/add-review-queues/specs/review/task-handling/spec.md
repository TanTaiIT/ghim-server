## Purpose

Cho người duyệt nhận một việc và giữ nó đủ lâu để xem và quyết, mà không để hai người cùng xử một việc hay để
một việc kẹt mãi trong tay một người (TK 17, cam kết 8).

## ADDED Requirements

### Requirement: Nhận việc và giữ trong 10 phút

Người có việc trong hàng chờ của mình SHALL nhận được việc đó và giữ nó 10 phút (giá trị khởi đầu). Mỗi việc
MUST có tối đa một người đang nhận; trong lúc đó người khác thấy việc "đang có người xử" và không nhận được.

#### Scenario: Nhận việc

- **WHEN** staff nhận một việc chưa ai nhận trong hàng chờ của mình
- **THEN** response có HTTP 200 kèm thời điểm hết giữ là 10 phút sau

#### Scenario: Người khác xem việc đang có người nhận

- **WHEN** staff A đang nhận một việc và staff B cùng danh mục xem hàng chờ
- **THEN** B thấy việc đó ở trạng thái "đang có người xử"

#### Scenario: Người khác nhận việc đang có người giữ

- **WHEN** staff B nhận việc mà staff A đang giữ
- **THEN** response có HTTP 409 `TASK_CLAIMED`

#### Scenario: Hai người nhận cùng lúc

- **WHEN** staff A và staff B nhận cùng một việc trong cùng một lúc
- **THEN** đúng một người nhận được, người kia nhận HTTP 409 `TASK_CLAIMED`

#### Scenario: Việc đã đóng

- **WHEN** staff nhận một việc vừa bị huỷ hoặc vừa có quyết định
- **THEN** response có HTTP 409 `TASK_CLOSED`

### Requirement: Quá 10 phút thì việc tự trả về hàng chờ

Việc được nhận quá 10 phút (giá trị khởi đầu) mà chưa có quyết định SHALL tự trả về hàng chờ; hệ thống kiểm
mỗi phút. Người nhận cũ mất quyền quyết và người có quyền khác nhận được việc.

#### Scenario: Giữ quá 10 phút

- **WHEN** staff A nhận một việc và 11 phút sau vẫn chưa quyết
- **THEN** việc trở về hàng chờ và staff B cùng danh mục nhận được việc đó

#### Scenario: Quyết sau khi hết giữ

- **WHEN** staff A quyết một việc đã tự trả về hàng chờ
- **THEN** response có HTTP 409 `TASK_NOT_CLAIMED` và không có gì thay đổi

### Requirement: Chỉ người đang nhận việc mới quyết được

Quyết định về một việc SHALL chỉ được chấp nhận từ người đang giữ việc đó, trong thời gian giữ.

#### Scenario: Quyết khi chưa nhận

- **WHEN** staff quyết một việc trong hàng chờ của mình mà chưa bấm nhận
- **THEN** response có HTTP 409 `TASK_NOT_CLAIMED`

#### Scenario: Master cũng nhận trước khi quyết

- **WHEN** master quyết một việc mà chưa bấm nhận, hoặc nhận một việc staff khác đang giữ
- **THEN** response lần lượt có HTTP 409 `TASK_NOT_CLAIMED` và HTTP 409 `TASK_CLAIMED` (chốt 15/10/2026)

### Requirement: Mất vai thì việc đang nhận trả về ngay

Điều hành viên bị bãi nhiệm, đổi phạm vi hay tạm mất vai trong lúc đang nhận việc mà vai đó cho xử SHALL mất việc
ngay: việc trả về hàng chờ, không đợi hết thời gian giữ (chốt 15/10/2026).

#### Scenario: Điều hành viên bị bãi nhiệm khi đang nhận

- **WHEN** điều hành viên lớp 10A đang nhận một việc về tin của lớp thì bị chủ nhóm bãi nhiệm
- **THEN** việc trở về hàng chờ ngay và điều hành viên khác của lớp 10A nhận được việc đó

### Requirement: Việc bị chuyển chỗ thì người đang nhận mất quyền quyết

Khi một việc đang có người nhận bị chuyển chỗ — sang hàng master vì quá hạn, hay vì gộp thêm lý do làm đổi
người xử — người đang nhận SHALL mất quyền quyết ngay và được báo việc đã chuyển.

#### Scenario: Việc quá hạn trong lúc đang nhận

- **WHEN** staff A đang nhận một việc hàng 0 thì việc chạm hạn và được chuyển sang hàng master, rồi A quyết
- **THEN** response có HTTP 409 `TASK_REASSIGNED` kèm câu báo việc đã chuyển, và không có gì thay đổi

### Requirement: Người xử thấy đủ bối cảnh

Người đang nhận một việc về tin SHALL thấy: nội dung hiện tại của tin, điểm rủi ro và các luật máy đã trúng,
lịch sử tin sạch của người bán, các tin của tài khoản khác có ảnh trùng, và các tài khoản dùng chung thiết
bị với người đăng.

#### Scenario: Tin bị giữ vì ảnh trùng

- **WHEN** staff nhận việc về một tin bị giữ vì ảnh trùng với tin của tài khoản X
- **THEN** staff thấy tin của X có ảnh trùng, cùng điểm rủi ro và các luật máy đã trúng

#### Scenario: Người đăng dùng chung thiết bị

- **WHEN** staff nhận việc về tin của một người đăng dùng chung thiết bị với tài khoản Y
- **THEN** staff thấy "dùng chung thiết bị với tài khoản Y" và response không chứa mã thiết bị

#### Scenario: Lịch sử tin sạch

- **WHEN** staff nhận việc về tin của một người bán có 4 tin sạch
- **THEN** staff thấy người bán có 4 tin sạch
