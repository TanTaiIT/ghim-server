## ADDED Requirements

### Requirement: Đánh dấu tài khoản bắt đầu đăng tin sau khi máy có tài khoản nhận gậy

Tài khoản đăng tin lần đầu trên một máy SAU KHI một tài khoản khác đã đăng tin trên máy đó nhận gậy SHALL bị
đánh dấu "dùng máy của tài khoản có gậy" tới khi gậy đó hết hiệu lực — hết hạn hoặc bị huỷ. Tài khoản đã đăng
tin trên máy từ trước lúc gậy được ra MUST NOT bị đánh dấu.

#### Scenario: Lập tài khoản mới ngay sau khi nhận gậy

- **WHEN** tài khoản A nhận gậy thường rồi tài khoản B đăng tin lần đầu trên cùng máy
- **THEN** B bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Người nhà đã đăng tin từ trước

- **WHEN** tài khoản B đã đăng tin trên máy trước khi tài khoản A trên cùng máy nhận gậy
- **THEN** B không bị đánh dấu

#### Scenario: Gậy hết hạn

- **WHEN** gậy của A hết hạn
- **THEN** B hết bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Gậy bị huỷ

- **WHEN** gậy của A bị huỷ vì khiếu nại thắng
- **THEN** B hết bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Gậy nghiêm trọng được hạ thành gậy nặng

- **WHEN** A nhận gậy nghiêm trọng, B bắt đầu đăng tin trên cùng máy, rồi master hạ gậy của A thành gậy nặng và
  mở khoá A
- **THEN** B vẫn bị đánh dấu "dùng máy của tài khoản có gậy" tới khi gậy nặng đó hết hạn
