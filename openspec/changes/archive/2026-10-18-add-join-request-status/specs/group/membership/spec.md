## ADDED Requirements

### Requirement: Người xin thấy đơn đang chờ của mình

Hồ sơ nhóm SHALL kèm đơn đang chờ của chính người xem ở nhóm đó — mã đơn, lúc gửi, hạn tự huỷ — để người xin biết đã
gửi và rút được đơn. Đơn MUST hiện cả khi hồ sơ chỉ có tên nhóm. Hồ sơ MUST NOT kèm đơn của người khác, và MUST NOT kèm
đơn đã được duyệt, bị từ chối, đã rút hay đã quá hạn.

#### Scenario: Vừa gửi đơn vào nhóm xét duyệt

- **WHEN** một người dùng gửi đơn vào nhóm công khai · xét duyệt rồi mở hồ sơ nhóm
- **THEN** hồ sơ kèm đơn đang chờ của người đó, đúng mã đơn và hạn tự huỷ của đơn

#### Scenario: Đơn vào nhóm có mã

- **WHEN** một người ngoài gửi đơn vào nhóm riêng tư · có mã bằng đúng mã nhóm rồi mở hồ sơ nhóm
- **THEN** hồ sơ chỉ có tên nhóm và đơn đang chờ của người đó

#### Scenario: Chưa gửi đơn

- **WHEN** một người dùng chưa gửi đơn mở hồ sơ một nhóm công khai · xét duyệt
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Người khác xem

- **WHEN** khách, hoặc một người dùng khác, mở hồ sơ của nhóm mà một người đang có đơn chờ
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Đơn đã rút

- **WHEN** người xin rút đơn rồi mở hồ sơ nhóm
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Đơn được duyệt

- **WHEN** điều hành viên duyệt đơn và người xin mở hồ sơ nhóm
- **THEN** hồ sơ cho biết người đó là thành viên và không kèm đơn nào

#### Scenario: Đơn đã quá hạn

- **WHEN** người xin mở hồ sơ nhóm khi đơn đã gửi 22 ngày mà chưa ai xử
- **THEN** hồ sơ không kèm đơn nào
