## ADDED Requirements

### Requirement: Chủ nhóm bị xoá tài khoản giữa chừng

Tài khoản bị xoá mà vẫn là chủ một nhóm — lượt xoá chen với lượt nhận làm chủ của chính người đó — thì nhóm SHALL sang
thiếu chủ hoặc tạm khoá như khi tài khoản chủ bị khoá. Nhóm MUST NOT ở lại đang hoạt động với chủ đã xoá.

#### Scenario: Chủ bị xoá, nhóm có điều hành viên

- **WHEN** tài khoản chủ của một nhóm có điều hành viên cấp cả nhóm bị xoá
- **THEN** nhóm sang thiếu chủ và người được đề cử là điều hành viên đó

### Requirement: Chủ bị khoá khi nhóm đang chuyển sang riêng tư

Tài khoản chủ bị khoá lúc nhóm đang chuyển sang riêng tư thì nhóm SHALL chuyển xong sang riêng tư trước, rồi mới sang
thiếu chủ hoặc tạm khoá. Yêu cầu chuyển của chủ MUST NOT bị bỏ dở.

#### Scenario: Có điều hành viên

- **WHEN** chủ của một nhóm đang chuyển sang riêng tư · có mã, có điều hành viên cấp cả nhóm, bị khoá, rồi mọi tin mức
  "nhóm công khai" đã hạ xong
- **THEN** nhóm ở chế độ riêng tư · có mã, thiếu chủ, và người được đề cử là điều hành viên đó

#### Scenario: Không có điều hành viên

- **WHEN** chủ của một nhóm đang chuyển sang riêng tư · chỉ lời mời, không có điều hành viên, bị khoá, rồi mọi tin mức
  "nhóm công khai" đã hạ xong
- **THEN** nhóm ở chế độ riêng tư · chỉ lời mời và tạm khoá
