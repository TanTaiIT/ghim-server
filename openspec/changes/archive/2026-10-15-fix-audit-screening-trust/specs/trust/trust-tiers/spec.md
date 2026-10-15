## ADDED Requirements

### Requirement: Tư cách tin sạch theo trạng thái hiện tại của tin

Tin mất hay có lại tư cách tin sạch vì bị gỡ do vi phạm SHALL theo trạng thái hiện tại của tin: một lượt gỡ được
hệ thống xử lại sau khi tin đã được khôi phục MUST NOT làm tin mất tư cách, và lượt khôi phục xử lại khi tin đang
bị gỡ vì vi phạm MUST NOT trả lại tư cách (chốt 15/10/2026).

#### Scenario: Lượt gỡ được xử lại sau khiếu nại thắng

- **WHEN** tin sạch bị gỡ vì vi phạm, người đăng khiếu nại thắng, rồi hệ thống xử lại lượt gỡ
- **THEN** tin vẫn là tin sạch và mức tin cậy không đổi

### Requirement: Các lượt tính mức của một tài khoản chạy lần lượt

Các lượt tính lại mức của cùng một tài khoản SHALL chạy lần lượt, mỗi lượt đọc dữ kiện mới nhất lúc tới lượt mình,
để mức cuối cùng luôn theo dữ kiện mới nhất dù nhiều lượt tính chạy cùng lúc (chốt 15/10/2026).

#### Scenario: Tính lại trong lúc tin bị gỡ vì vi phạm

- **WHEN** lượt tính hằng ngày của một tài khoản T1 đang chạy thì tin sạch duy nhất giúp nó lên T1 bị gỡ vì vi phạm
- **THEN** sau cả hai lượt tính, tài khoản ở T0
