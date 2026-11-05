# group/group-modes Spec Delta

## ADDED Requirements

### Requirement: Tỉnh/thành của nhóm

Chủ nhóm hoặc master SHALL đặt, đổi hoặc gỡ tỉnh/thành của nhóm — một tỉnh/thành, tuỳ chọn; gỡ về
trống là nhóm toàn quốc. Hồ sơ nhóm MUST trả đúng tỉnh/thành đang gắn, hoặc trống khi chưa gắn.
Điều hành viên MUST NOT đổi được tỉnh/thành của nhóm.

#### Scenario: Chủ nhóm đặt tỉnh/thành

- **WHEN** chủ nhóm đặt tỉnh/thành của nhóm là một tỉnh/thành có thật
- **THEN** hồ sơ nhóm trả đúng tỉnh/thành đó

#### Scenario: Chủ nhóm gỡ tỉnh/thành

- **WHEN** chủ nhóm gỡ tỉnh/thành của một nhóm đang gắn tỉnh
- **THEN** hồ sơ nhóm không còn tỉnh/thành

#### Scenario: Đặt tỉnh/thành không có thật

- **WHEN** chủ nhóm đặt tỉnh/thành của nhóm bằng một mã tỉnh/thành không tồn tại
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tỉnh/thành của nhóm không đổi

#### Scenario: Điều hành viên thử đổi tỉnh/thành

- **WHEN** một điều hành viên đổi tỉnh/thành của nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và tỉnh/thành không đổi

### Requirement: Lọc nhóm công khai theo tỉnh/thành

Tìm nhóm công khai SHALL lọc được theo tỉnh/thành, kết hợp với tìm theo tên. Không truyền
tỉnh/thành thì kết quả như khi chưa có bộ lọc này. Nhóm không gắn tỉnh/thành MUST NOT lọt vào kết
quả khi lọc theo một tỉnh/thành. Lọc theo tỉnh/thành MUST NOT làm lộ nhóm riêng tư.

#### Scenario: Khách lọc nhóm theo tỉnh/thành

- **WHEN** khách tìm nhóm công khai, lọc theo một tỉnh/thành mà chỉ một phần số nhóm khớp tên đang gắn
- **THEN** kết quả chỉ có các nhóm công khai gắn đúng tỉnh/thành đó

#### Scenario: Nhóm không gắn tỉnh không lọt lưới lọc

- **WHEN** khách lọc nhóm theo một tỉnh/thành, trong khi có nhóm công khai khớp tên nhưng không gắn tỉnh
- **THEN** kết quả không có nhóm không gắn tỉnh đó

#### Scenario: Không truyền tỉnh/thành

- **WHEN** khách tìm nhóm công khai mà không truyền tỉnh/thành
- **THEN** kết quả gồm mọi nhóm công khai khớp tên, bất kể có gắn tỉnh hay không

#### Scenario: Lọc theo tỉnh không lộ nhóm riêng tư

- **WHEN** khách lọc nhóm theo một tỉnh/thành mà một nhóm riêng tư cũng đang gắn
- **THEN** kết quả không có nhóm riêng tư đó
