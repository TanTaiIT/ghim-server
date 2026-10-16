## ADDED Requirements

### Requirement: Bật hiện tên nhóm khi đổi sang riêng tư

Công tắc "hiện tên nhóm trên tin sàn" SHALL xét theo chế độ nhóm đang có: lượt đổi sang riêng tư phải qua trạng thái
chuyển thì nhóm vẫn công khai tới khi chuyển xong, nên lượt đó MUST NOT bật được công tắc.

#### Scenario: Bật cùng lượt đổi còn tin công khai

- **WHEN** chủ nhóm đổi một nhóm công khai còn tin mức "nhóm công khai" sang riêng tư · có mã và bật "hiện tên nhóm
  trên tin sàn" trong cùng lượt
- **THEN** response có HTTP 409 `GROUP_MODE_CONFLICT` và nhóm vẫn đang hoạt động ở chế độ cũ
