## MODIFIED Requirements

### Requirement: Danh mục bị tắt

Khi một danh mục bị tắt, mọi tin trong danh mục SHALL tạm ẩn với lý do "danh mục bị tắt"; bật lại thì lý do này
được gỡ. Người đăng SHALL đổi được tin sang một danh mục đang bật — tin qua máy lại và lý do được gỡ.

#### Scenario: Tắt danh mục

- **WHEN** master tắt một danh mục có tin đang hiển thị
- **THEN** các tin đó tạm ẩn với lý do "danh mục bị tắt"

#### Scenario: Bật lại danh mục

- **WHEN** master bật lại danh mục đó
- **THEN** các tin hiện lại đúng như cũ

#### Scenario: Đổi sang danh mục khác

- **WHEN** người đăng đổi một tin đang tạm ẩn vì danh mục bị tắt sang một danh mục đang bật
- **THEN** lý do "danh mục bị tắt" được gỡ và tin chuyển sang đang kiểm

#### Scenario: Rút về nháp rồi gửi sang danh mục đang bật

- **WHEN** người đăng rút về nháp một tin chờ duyệt đang tạm ẩn vì danh mục bị tắt, đổi sang một danh mục đang bật rồi gửi
- **THEN** lý do "danh mục bị tắt" được gỡ và tin chuyển sang đang kiểm

### Requirement: Đổi nơi đăng ra khỏi nhóm thì lý do của nhóm rơi theo

Tin đang tạm ẩn vì một nhóm — người đăng tự rời, bị gỡ hay bị cấm khỏi nhóm, nhóm bị tạm khoá — mà người đăng đổi
nơi đăng ra khỏi nhóm đó SHALL mất mọi lý do tạm ẩn của nhóm ấy; tin qua máy như mọi lần đổi nơi đăng, và lý do
không thuộc nhóm (tài khoản, danh mục) vẫn giữ (chốt 12/10/2026).

#### Scenario: Người bị cấm đưa tin lên sàn chung

- **WHEN** người bị cấm khỏi nhóm X đổi tin "nhóm công khai" đang tạm ẩn vì bị cấm của mình lên sàn chung, có đủ
  tỉnh và phường
- **THEN** lý do "bị cấm khỏi nhóm" được gỡ và tin chuyển sang đang kiểm ở sàn chung

#### Scenario: Còn lý do của danh mục

- **WHEN** người đăng đổi lên sàn chung một tin "chỉ thành viên" đang tạm ẩn vì đã rời nhóm X và vì danh mục bị tắt
- **THEN** lý do "đã rời nhóm" được gỡ, còn lý do "danh mục bị tắt" vẫn giữ

#### Scenario: Rút về nháp rồi đưa lên sàn chung

- **WHEN** tin chờ duyệt trong nhóm X tạm ẩn vì nhóm X bị tạm khoá, người đăng rút về nháp, đổi lên sàn chung có đủ tỉnh và phường rồi gửi
- **THEN** lý do "nhóm bị tạm khoá" được gỡ và tin chuyển sang đang kiểm ở sàn chung

#### Scenario: Gia hạn kèm đổi nơi đăng

- **WHEN** tin hết hạn đang tạm ẩn vì người đăng bị cấm khỏi nhóm X được gia hạn kèm đổi lên sàn chung có đủ tỉnh và phường
- **THEN** lý do "bị cấm khỏi nhóm" được gỡ và tin chuyển sang đang kiểm ở sàn chung
