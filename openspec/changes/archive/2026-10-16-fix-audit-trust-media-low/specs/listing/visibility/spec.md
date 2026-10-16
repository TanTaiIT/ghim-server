## ADDED Requirements

### Requirement: Lên T1 đúng lúc tin đang lên bảng

Lượt đưa tin lên bảng SHALL tính lý do "tài khoản mới" theo mức tin cậy của người đăng đúng lúc ghi. Người đăng lên T1
chen giữa lượt đó MUST NOT để lại lý do "tài khoản mới" trên tin.

#### Scenario: Lên T1 trong lúc máy đang cho qua tin

- **WHEN** lượt tính mức đang đưa người đăng từ T0 lên T1 thì máy cho qua một tin sàn chung của người đó
- **THEN** lượt cho qua đọc được mức T1 sau khi lượt tính mức xong, và tin không mang lý do "tài khoản mới"
