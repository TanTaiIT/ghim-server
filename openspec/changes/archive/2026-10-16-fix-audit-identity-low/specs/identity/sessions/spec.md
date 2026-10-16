## ADDED Requirements

### Requirement: Trần phiên đúng cả khi đăng nhập cùng lúc

Nhiều lượt đăng nhập cùng lúc của một tài khoản SHALL không làm tài khoản có quá số phiên tối đa cùng hoạt động.

#### Scenario: Đăng nhập cùng lúc khi đã gần trần

- **WHEN** một tài khoản người dùng đang có 19 phiên và đăng nhập cùng lúc trên ba thiết bị nữa
- **THEN** cả ba lượt đăng nhập thành công và tài khoản vẫn không có quá 20 phiên cùng hoạt động
