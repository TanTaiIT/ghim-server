## MODIFIED Requirements

### Requirement: Ma trận cho mức T0

Với tài khoản T0, dải Thấp SHALL cho hiện đầy đủ ở mọi nơi đăng — sàn chung, nhóm công khai, "chỉ thành viên" (mức tin
cậy không còn là lý do hạn chế, chốt 28/10/2026). Dải Vừa và dải Cao SHALL giữ cho người — chặt hơn T1, nơi dải Vừa chỉ
hiện hạn chế.

#### Scenario: T0 đăng sàn chung, dải Thấp

- **WHEN** tài khoản T0 gửi lên sàn chung một tin có điểm 0
- **THEN** kết quả máy là hiện đầy đủ, và tin không mang lý do hạn chế nào

#### Scenario: T0 đăng nhóm công khai, dải Thấp

- **WHEN** tài khoản T0 gửi vào nhóm, ở mức "nhóm công khai", một tin có điểm 20
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: T0 đăng "chỉ thành viên", dải Thấp

- **WHEN** tài khoản T0 gửi vào nhóm, ở mức "chỉ thành viên", một tin có điểm 0
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: Tài khoản 2 ngày tuổi ghi số Zalo trong mô tả

- **WHEN** tài khoản T0 2 ngày tuổi gửi lên sàn chung một tin ghi số Zalo trong mô tả, không trúng gì khác
- **THEN** điểm là 30 (tài khoản mới 10, liên hệ ngoài sàn 20), dải Vừa, và kết quả máy là giữ cho người
