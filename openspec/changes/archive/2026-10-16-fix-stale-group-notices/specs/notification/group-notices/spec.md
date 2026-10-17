## ADDED Requirements

### Requirement: Thông báo theo trạng thái hiện tại của nhóm

Thông báo về trạng thái của nhóm và tư cách của một người — chủ mới, thiếu chủ, chủ trở lại, tạm khoá, mở khoá, bị gỡ,
bị cấm, được gỡ cấm — SHALL chỉ được viết khi điều nó nói còn đúng lúc viết. Một thay đổi cũ được hệ thống xử lại sau
thay đổi mới hơn MUST NOT sinh thông báo trái với trạng thái hiện tại (chốt 16/10/2026).

#### Scenario: Lượt khoá được xử lại sau khi nhóm đã mở khoá

- **WHEN** master khoá rồi mở khoá một nhóm, và hệ thống xử lại lượt khoá
- **THEN** không thành viên nào nhận thêm thông báo "đang tạm khoá"

#### Scenario: Được gỡ cấm trước khi lượt cấm được báo

- **WHEN** một thành viên bị cấm rồi được gỡ cấm trước khi hệ thống báo lượt cấm
- **THEN** người đó nhận thông báo rằng mình không còn là thành viên, không có câu "không vào lại nhóm này được"

#### Scenario: Chủ nhóm đổi hai lần

- **WHEN** chủ nhóm chuyển cho An, An chuyển tiếp cho Bình, rồi hệ thống xử lại lượt chuyển cho An
- **THEN** không ai nhận thêm thông báo rằng An là chủ nhóm mới
