## ADDED Requirements

### Requirement: Bảng số theo ngày cho master

Bàn vận hành SHALL cho master xem số theo ngày (giờ Việt Nam) của N ngày gần nhất — N từ 1 tới 90, mặc định 7 — hôm
nay trước và tính cả hôm nay đang dở: tài khoản tạo mới, lượt gửi máy duyệt, tin lên bảng lần đầu, kết quả máy (đầy
đủ, hạn chế, giữ), quyết định của người về tin (đạt, từ chối — từ chối gồm từ chối, gỡ, vi phạm). Ngày không có gì
SHALL là dòng toàn 0. Người không phải master MUST nhận HTTP 403.

#### Scenario: Bảy ngày mặc định

- **WHEN** master xem bảng số mà không chọn số ngày
- **THEN** response có 7 dòng, dòng đầu là hôm nay theo giờ Việt Nam

#### Scenario: Ranh giới ngày theo giờ Việt Nam

- **WHEN** một tài khoản tạo lúc 23:30 giờ Việt Nam ngày D và một tài khoản khác lúc 00:10 giờ Việt Nam ngày D+1
- **THEN** dòng ngày D đếm 1 tài khoản mới và dòng ngày D+1 đếm 1

#### Scenario: Số của máy và của người trong một ngày

- **WHEN** hôm nay có ba lượt gửi máy — một đầy đủ, một hạn chế, một giữ — hai tin lên bảng lần đầu, và người duyệt
  cho đạt một tin, từ chối một tin, gỡ một tin, bác một báo cáo
- **THEN** dòng hôm nay ghi gửi 3, đầy đủ 1, hạn chế 1, giữ 1, lên bảng 2, đạt 1, từ chối 2

#### Scenario: Ngày trống

- **WHEN** hôm qua không có tài khoản, lượt máy, tin hay quyết định nào
- **THEN** dòng hôm qua có mặt với mọi số bằng 0

#### Scenario: Staff xem bảng số

- **WHEN** staff hay người dùng thường gọi bảng số
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Số ngày ngoài khoảng

- **WHEN** master hỏi 0 ngày hay 91 ngày
- **THEN** response có HTTP 400 `VALIDATION_ERROR`
