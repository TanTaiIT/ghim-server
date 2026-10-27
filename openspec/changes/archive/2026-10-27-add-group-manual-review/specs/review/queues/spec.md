## MODIFIED Requirements

### Requirement: Việc vào hàng của ai

Việc hàng 0 và hàng 5 về tin sàn SHALL vào hàng của staff được giao danh mục của tin, không theo khu vực; về
tin trong nhóm thì vào hàng của điều hành nhóm phụ trách phạm vi của tin, trừ việc hàng 0 về tin nhóm thuộc
danh mục đặt "tin nhóm bị giữ do sàn duyệt" (kể cả nhóm riêng tư) vào hàng staff được giao danh mục. Việc hàng 0
mà máy giữ chỉ vì nhóm bật "duyệt tay mọi tin" (`group/manual-review`) SHALL luôn vào chuỗi của nhóm, bất kể cài
đặt danh mục. Việc
hàng 3 và hàng 4 SHALL vào hàng staff được giao danh mục của tin. Danh mục chưa có staff thì việc vào hàng
master. Master SHALL thấy và xử được mọi việc.

#### Scenario: Tin sàn bị giữ

- **WHEN** một tin sàn thuộc danh mục Điện thoại bị máy giữ
- **THEN** việc hiện trong hàng của staff được giao Điện thoại và không hiện trong hàng của staff chỉ được
  giao Xe máy

#### Scenario: Staff khác danh mục nhận việc

- **WHEN** staff chỉ được giao Xe máy nhận việc về một tin Điện thoại bằng mã việc
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tin trong nhóm bị giữ

- **WHEN** tin của một thành viên lớp 10A trong một nhóm trường học, thuộc một danh mục đặt "tin nhóm bị giữ
  do nhóm duyệt", bị máy giữ
- **THEN** việc hiện trong hàng của điều hành viên lớp 10A và không hiện trong hàng của điều hành viên chỉ
  phụ trách lớp 10B

#### Scenario: Điều hành cả nhóm chỉ thấy việc của lớp khi lớp không còn ai xử được

- **WHEN** tin của một thành viên lớp 10A bị máy giữ, lớp 10A có điều hành viên xử được, và nhóm có một điều hành
  viên cấp cả nhóm
- **THEN** việc không hiện trong hàng của điều hành viên cấp cả nhóm hay của chủ nhóm (chốt 15/10/2026)

#### Scenario: Không chia theo khu vực

- **WHEN** hai tin sàn Điện thoại, một ở Hà Nội và một ở Cần Thơ, bị máy giữ
- **THEN** cả hai việc hiện trong hàng của mọi staff được giao Điện thoại

#### Scenario: Tin nhóm thuộc danh mục do sàn duyệt

- **WHEN** danh mục Thú cưng đặt "tin nhóm bị giữ do sàn duyệt", và một tin Thú cưng gửi vào nhóm riêng tư ở
  mức "chỉ thành viên" bị máy giữ
- **THEN** việc hàng 0 hiện trong hàng của staff được giao Thú cưng với hạn xử 24 giờ, và không hiện trong
  hàng của điều hành nhóm

#### Scenario: Nhóm duyệt tay ở danh mục do sàn duyệt

- **WHEN** danh mục Thú cưng đặt "tin nhóm bị giữ do sàn duyệt", nhóm bật "duyệt tay mọi tin", và một tin Thú cưng
  máy cho qua được gửi vào nhóm
- **THEN** việc hàng 0 hiện trong hàng của quản trị nhóm và không hiện trong hàng của staff được giao Thú cưng

#### Scenario: Mức rủi ro không quyết ai xử

- **WHEN** danh mục Đồng hồ có mức rủi ro cao, đặt "tin nhóm bị giữ do nhóm duyệt", và một tin Đồng hồ trong
  nhóm bị máy giữ
- **THEN** việc hiện trong hàng của điều hành nhóm phụ trách phạm vi của tin, không hiện trong hàng của staff
  được giao Đồng hồ

#### Scenario: Mở rộng nơi đăng rồi bị giữ

- **WHEN** người đăng mở rộng một tin đang hiển thị trong nhóm lên sàn chung và máy giữ bản sửa
- **THEN** việc hàng 0 hiện trong hàng của staff được giao danh mục của tin, không hiện trong hàng của điều
  hành nhóm

#### Scenario: Danh mục chưa có staff

- **WHEN** một tin sàn thuộc danh mục chưa giao cho staff nào bị máy giữ
- **THEN** việc hiện trong hàng của master

#### Scenario: Việc hạn chế do máy

- **WHEN** máy cho một tin sàn Điện thoại của T1 qua ở mức hạn chế
- **THEN** việc hàng 3 hiện trong hàng của staff được giao Điện thoại
