## ADDED Requirements

### Requirement: Phí đăng tin

Bảng uy tín SHALL cho biết phí của một lượt đăng tin cùng chỗ với hạn mức, để app hiện trước khi người đăng soạn tin.
Phí hiện bằng 0 Xu (TK 29 — phí đăng tin hoãn, app hiện "Miễn phí"); luật phí nằm một chỗ ở `listing`, ngày bật phí không
đổi hợp đồng này.

#### Scenario: Bảng uy tín khi chưa thu phí

- **WHEN** người đăng mở bảng uy tín của mình
- **THEN** response có `quota.fee` là `{ amount: 0, currency: "xu" }`
