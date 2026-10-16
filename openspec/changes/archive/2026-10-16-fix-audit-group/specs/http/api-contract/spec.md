## MODIFIED Requirements

### Requirement: Xung đột khi ghi đồng thời

Khi một lượt ghi vi phạm ràng buộc dữ liệu vì một lượt khác vừa ghi chen vào, hay DB huỷ lượt ghi vì hai lượt chờ nhau,
hệ thống SHALL trả HTTP 409 `CONFLICT` kèm câu báo tải lại rồi thử lại. Dòng vừa bị xoá trước lúc ghi SHALL trả HTTP
404 `NOT_FOUND`.

#### Scenario: Hai lượt ghi cùng một giá trị duy nhất

- **WHEN** hai request cùng lúc ghi một giá trị phải là duy nhất
- **THEN** một request thành công, request kia nhận HTTP 409 `CONFLICT`

#### Scenario: Vi phạm ràng buộc kiểm tra hoặc loại trừ

- **WHEN** hai lượt ghi chen nhau làm dữ liệu vi phạm một ràng buộc kiểm tra hoặc loại trừ của DB
- **THEN** lượt bị từ chối nhận HTTP 409 `CONFLICT`, không phải 500

#### Scenario: Dòng vừa bị người khác xoá

- **WHEN** client sửa một dòng vừa bị xoá giữa lúc kiểm và lúc ghi
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Hai lượt ghi chờ nhau

- **WHEN** DB huỷ một lượt ghi vì nó và một lượt khác chờ khoá của nhau
- **THEN** lượt bị huỷ nhận HTTP 409 `CONFLICT` kèm câu báo thử lại, không phải 500
