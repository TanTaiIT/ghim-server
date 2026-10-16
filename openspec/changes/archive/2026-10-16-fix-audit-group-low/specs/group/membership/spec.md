## ADDED Requirements

### Requirement: Huỷ kèm theo vẫn báo

Đơn xin vào, lời mời, lời giao chủ bị hệ thống huỷ kèm theo một việc khác — người đó vào nhóm bằng đường khác, bị cấm,
tài khoản bị xoá, nhóm tạm khoá vì không còn ai giữ — SHALL được báo như khi huỷ bằng tay: quản trị nhóm nhận số đơn đang
chờ mới. Người chưa là thành viên nhận lời giao chủ thì đơn và lời mời còn chờ của họ ở nhóm đó SHALL bị huỷ.

#### Scenario: Có đơn chờ rồi vào bằng lời mời

- **WHEN** Lan đang có đơn chờ vào nhóm A, rồi nhận lời mời vào nhóm A
- **THEN** Lan là thành viên, đơn của Lan bị huỷ, và kết nối của chủ nhóm A nhận số đơn đang chờ mới

#### Scenario: Cấm người đang có đơn và lời mời

- **WHEN** chủ nhóm cấm một người đang có đơn chờ và lời mời chờ ở nhóm
- **THEN** đơn và lời mời của người đó bị huỷ, và kết nối của chủ nhóm nhận số đơn đang chờ mới

#### Scenario: Người ngoài nhận lời giao chủ

- **WHEN** Lan đang có đơn chờ vào nhóm A, rồi nhận lời master giao chủ nhóm A
- **THEN** Lan là chủ nhóm A và đơn của Lan bị huỷ
