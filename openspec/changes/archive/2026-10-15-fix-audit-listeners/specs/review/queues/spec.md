## ADDED Requirements

### Requirement: Việc của tin trong nhóm theo tư cách thành viên hiện tại

Việc máy giữ về tin trong nhóm SHALL bị huỷ hay sinh lại theo tư cách thành viên hiện tại của người đăng: lượt rời
nhóm được xử lại sau khi người đó đã vào lại MUST NOT huỷ việc, và lượt vào lại xử lại khi người đó đã rời hay bị
cấm MUST NOT sinh việc (chốt 15/10/2026).

#### Scenario: Lượt rời được xử lại sau khi vào lại

- **WHEN** thành viên có tin chờ duyệt trong nhóm rời rồi vào lại nhóm, và hệ thống xử lại lượt rời
- **THEN** tin vẫn có đúng một việc hàng 0 đang mở trong hàng của điều hành nhóm
