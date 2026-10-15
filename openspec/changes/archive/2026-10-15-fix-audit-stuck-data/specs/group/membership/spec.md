## MODIFIED Requirements

### Requirement: Rời, bị gỡ hay bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ

Khi một thành viên tự rời, bị gỡ hay bị cấm khỏi nhóm, mọi việc máy giữ đang mở về tin của người đó mà lượt
rời làm tạm ẩn SHALL bị huỷ. Tin "nhóm công khai" ở lại làm tin người ngoài (nhóm đang nhận tin người ngoài, người
đó tự rời hay bị gỡ) MUST giữ việc (chốt 15/10/2026). Huỷ việc MUST NOT làm tin hiện lên; việc về tin của người đó ở nơi khác MUST giữ nguyên (TK 10).

#### Scenario: Bị gỡ khỏi nhóm khi có tin chờ duyệt

- **WHEN** một thành viên có tin trong nhóm đang chờ duyệt bị gỡ khỏi nhóm
- **THEN** việc về tin đó bị huỷ và tin không hiện trong nhóm

#### Scenario: Tin ở sàn chung không bị ảnh hưởng

- **WHEN** thành viên bị cấm khỏi nhóm cũng có một tin sàn đang chờ duyệt
- **THEN** việc về tin sàn đó vẫn mở trong hàng của staff danh mục

#### Scenario: Vào lại nhóm khi tin còn chờ duyệt

- **WHEN** thành viên có tin chờ duyệt trong nhóm rời nhóm (việc bị huỷ), rồi vào lại nhóm khi tin vẫn chờ duyệt
- **THEN** tin có một việc hàng 0 mới với hạn xử 24 giờ kể từ lúc vào lại, trong hàng của điều hành nhóm phụ trách
  phạm vi của tin (chốt 15/10/2026)

#### Scenario: Rời nhóm đang nhận tin người ngoài

- **WHEN** thành viên có một tin "nhóm công khai" và một tin "chỉ thành viên" đang chờ duyệt tự rời một nhóm đang nhận tin người ngoài
- **THEN** việc về tin "chỉ thành viên" bị huỷ, còn việc về tin "nhóm công khai" vẫn mở trong hàng của điều hành nhóm
