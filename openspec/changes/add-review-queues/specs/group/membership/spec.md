## ADDED Requirements

### Requirement: Rời, bị gỡ hay bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ

Khi một thành viên tự rời, bị gỡ hay bị cấm khỏi nhóm, mọi việc máy giữ đang mở về tin của người đó trong nhóm
SHALL bị huỷ. Huỷ việc MUST NOT làm tin hiện lên; việc về tin của người đó ở nơi khác MUST giữ nguyên (TK 10).

#### Scenario: Bị gỡ khỏi nhóm khi có tin chờ duyệt

- **WHEN** một thành viên có tin trong nhóm đang chờ duyệt bị gỡ khỏi nhóm
- **THEN** việc về tin đó bị huỷ và tin không hiện trong nhóm

#### Scenario: Tin ở sàn chung không bị ảnh hưởng

- **WHEN** thành viên bị cấm khỏi nhóm cũng có một tin sàn đang chờ duyệt
- **THEN** việc về tin sàn đó vẫn mở trong hàng của staff danh mục
