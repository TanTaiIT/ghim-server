## MODIFIED Requirements

### Requirement: Không ai, trừ master, xử việc của chính mình

Việc về một tin hay về một người MUST NOT hiện trong hàng chờ, và MUST NOT nhận hay quyết được, bởi người đăng
tin đó, bởi chính người đó, hay bởi tài khoản dùng chung thiết bị với họ. Luật này SHALL áp cho mọi vai, trừ
master. Hai tài khoản dùng chung thiết bị khi cả hai từng đăng tin hoặc đăng nhập từ cùng một máy trong 180 ngày gần
nhất — toàn bộ dữ liệu thiết bị hệ thống còn giữ (chốt 15/10/2026; dấu đăng nhập thêm 24/10/2026).

#### Scenario: Staff đăng tin trong danh mục của mình

- **WHEN** staff được giao Điện thoại đăng một tin Điện thoại và tin bị máy giữ
- **THEN** việc về tin đó không hiện trong hàng chờ của chính staff ấy

#### Scenario: Nhận việc của mình bằng mã việc

- **WHEN** staff nhận việc về tin của chính mình bằng mã việc
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tài khoản phụ trên cùng máy

- **WHEN** staff S và tài khoản B đều đã đăng tin từ cùng một máy, và tin của B bị máy giữ
- **THEN** việc về tin của B không hiện trong hàng chờ của S

#### Scenario: Tài khoản phụ chỉ đăng nhập trên máy của staff

- **WHEN** staff S đã đăng nhập app từ một máy mà chưa từng đăng tin, tài khoản B đăng tin từ cùng máy đó và tin bị
  máy giữ
- **THEN** việc về tin của B không hiện trong hàng chờ của S, và S nhận việc đó bằng mã việc thì nhận HTTP 404
  `NOT_FOUND`

#### Scenario: Điều hành viên đăng tin trong nhóm mình

- **WHEN** điều hành viên đăng tin trong nhóm mình phụ trách và tin bị máy giữ
- **THEN** việc về tin đó không hiện trong hàng chờ của chính điều hành viên ấy

#### Scenario: Khôi phục tin của chính mình

- **WHEN** staff khôi phục một tin sàn đang bị gỡ do chính mình đăng
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn bị gỡ
