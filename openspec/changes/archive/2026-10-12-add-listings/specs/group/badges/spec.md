## ADDED Requirements

### Requirement: Gắn huy hiệu nhóm lên tin sàn chung

Người đăng SHALL gắn được huy hiệu của một nhóm lên tin sàn chung của mình chỉ khi đang có quyền mang huy hiệu
của nhóm đó. Huy hiệu MUST NOT gắn lên tin không ở sàn chung, và không làm tin được duyệt dễ hơn (TK 10).

#### Scenario: Thành viên vào qua đơn được duyệt

- **WHEN** chị Lan, vào nhóm xét duyệt Công ty ABC qua đơn được duyệt, gắn huy hiệu nhóm lên tin sàn chung của
  mình
- **THEN** huy hiệu được gắn và tin hiện dòng "Thành viên Công ty ABC" khi lên bảng

#### Scenario: Thành viên vào bằng bấm tham gia

- **WHEN** một người vào nhóm mở cửa bằng bấm Tham gia gắn huy hiệu của nhóm đó lên tin sàn chung
- **THEN** response có HTTP 403 `BADGE_NOT_ELIGIBLE` và tin không đổi

#### Scenario: Gắn lên tin trong nhóm

- **WHEN** người đăng gắn huy hiệu lên một tin "nhóm công khai"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

### Requirement: Mỗi tin một huy hiệu

Một tin sàn chung SHALL mang tối đa 1 huy hiệu nhóm. Huy hiệu mà nhóm đã gỡ khỏi một tin MUST NOT được người đăng
gắn lại lên chính tin đó (TK 10, chốt 12/10/2026).

#### Scenario: Gắn huy hiệu thứ hai

- **WHEN** người đăng gắn huy hiệu nhóm Y lên tin sàn chung đang mang huy hiệu nhóm X
- **THEN** response có HTTP 409 `BADGE_ALREADY_ATTACHED` và tin vẫn chỉ mang huy hiệu nhóm X

#### Scenario: Gắn lại huy hiệu nhóm đã gỡ

- **WHEN** điều hành viên nhóm X đã gỡ huy hiệu nhóm X khỏi một tin, rồi người đăng gắn lại huy hiệu nhóm X lên
  tin đó
- **THEN** response có HTTP 403 `BADGE_REMOVED_BY_GROUP` và tin không mang huy hiệu

### Requirement: Huy hiệu tự gỡ khỏi tin khi người đăng mất quyền

Khi người đăng mất quyền mang huy hiệu của một nhóm — rời, bị gỡ, bị cấm khỏi nhóm, nhóm đóng, hay nhóm đổi cách
vào hoặc tắt hiện tên — huy hiệu đó SHALL được gỡ khỏi tin của người đó ngay. Mất huy hiệu MUST NOT đổi trạng
thái, nơi đăng hay mức hiển thị của tin.

#### Scenario: Rời nhóm

- **WHEN** người đăng có tin sàn chung mang huy hiệu nhóm X rời nhóm X
- **THEN** tin không còn huy hiệu nhóm X và vẫn đang hiển thị như cũ, không qua máy

#### Scenario: Nhóm đóng

- **WHEN** nhóm X đóng
- **THEN** huy hiệu nhóm X biến khỏi mọi tin sàn chung

#### Scenario: Nhóm riêng tư tắt hiện tên nhóm

- **WHEN** chủ một nhóm riêng tư tắt "hiện tên nhóm trên tin sàn"
- **THEN** ngay sau đó không tin sàn chung nào còn hiện huy hiệu của nhóm đó

#### Scenario: Bật lại hiện tên nhóm

- **WHEN** chủ nhóm đó bật lại "hiện tên nhóm trên tin sàn"
- **THEN** huy hiệu đã tự gỡ không tự trở lại trên tin nào; người đăng đủ quyền gắn lại được (chốt 12/10/2026)

### Requirement: Nhóm tạm khoá thì huy hiệu ẩn theo

Khi nhóm bị tạm khoá, huy hiệu của nhóm trên mọi tin sàn chung SHALL ẩn; mở khoá thì huy hiệu hiện lại đúng như
cũ. Tin mang huy hiệu MUST NOT bị ẩn theo.

#### Scenario: Khoá rồi mở khoá nhóm

- **WHEN** nhóm X bị tạm khoá rồi được mở khoá
- **THEN** trong lúc khoá, tin sàn chung vẫn hiện nhưng không có huy hiệu nhóm X; mở khoá thì huy hiệu hiện
  lại trên đúng các tin cũ

### Requirement: Nhóm gỡ huy hiệu của mình nhưng không gỡ được tin sàn

Điều hành viên, chủ nhóm và master SHALL gỡ được huy hiệu của nhóm khỏi một tin sàn chung; tin vẫn hiển thị,
không qua máy. Nhóm MUST NOT gỡ được tin sàn chung hay huy hiệu của nhóm khác (TK 27 cam kết 23).

#### Scenario: Điều hành viên gỡ huy hiệu

- **WHEN** điều hành viên nhóm X gỡ huy hiệu nhóm X khỏi một tin sàn chung
- **THEN** tin không còn huy hiệu nhóm X và vẫn đang hiển thị

#### Scenario: Điều hành viên gỡ tin sàn

- **WHEN** điều hành viên nhóm X gỡ chính tin sàn chung mang huy hiệu nhóm X
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn hiển thị

#### Scenario: Gỡ huy hiệu của nhóm khác

- **WHEN** điều hành viên nhóm X gỡ huy hiệu nhóm Y khỏi một tin sàn chung
- **THEN** response có HTTP 403 `FORBIDDEN`
