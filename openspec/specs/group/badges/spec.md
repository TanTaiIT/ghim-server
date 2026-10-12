# group/badges Specification

## Purpose

Quyết định thành viên nào có quyền mang dòng "Thành viên nhóm X" trên tin sàn chung, để huy hiệu chỉ chứng
minh điều nhóm đã thực sự xét (TK 9, TK 10, cam kết 23).

## Requirements

### Requirement: Ai có quyền mang huy hiệu

Chỉ người đang là thành viên SHALL có quyền mang huy hiệu của nhóm, và chỉ khi vào bằng đường được xét — được
duyệt, lời mời, danh sách lớp, master giao — trong lúc nhóm là công khai · xét duyệt, hoặc là nhóm riêng tư
có bật "hiện tên nhóm trên tin sàn". Nhóm đã đóng MUST NOT cho ai quyền mang huy hiệu.

#### Scenario: Được duyệt vào nhóm xét duyệt

- **WHEN** một người vào nhóm công khai · xét duyệt qua đơn được duyệt
- **THEN** người đó có quyền mang huy hiệu của nhóm

#### Scenario: Được mời vào nhóm mở cửa

- **WHEN** một người vào nhóm công khai · mở cửa bằng lời mời
- **THEN** người đó không có quyền mang huy hiệu của nhóm

#### Scenario: Nhóm riêng tư chưa bật hiện tên

- **WHEN** một người vào nhóm riêng tư · chỉ lời mời theo danh sách lớp và nhóm chưa bật hiện tên
- **THEN** người đó không có quyền mang huy hiệu của nhóm

#### Scenario: Nhóm riêng tư đã bật hiện tên

- **WHEN** chủ của nhóm riêng tư đó bật "hiện tên nhóm trên tin sàn"
- **THEN** người vào theo danh sách lớp có quyền mang huy hiệu của nhóm

#### Scenario: Không còn là thành viên

- **WHEN** một người đang có quyền mang huy hiệu rời nhóm, bị gỡ hoặc bị cấm khỏi nhóm
- **THEN** người đó không còn quyền mang huy hiệu của nhóm

#### Scenario: Nhóm đóng

- **WHEN** nhóm đóng
- **THEN** không ai còn quyền mang huy hiệu của nhóm đó

### Requirement: Bấm tham gia không bao giờ có huy hiệu

Thành viên vào bằng bấm tham gia MUST NOT có quyền mang huy hiệu của nhóm đó, kể cả khi nhóm đổi sang có xét
duyệt sau đó.

#### Scenario: Nhóm mở cửa đổi sang xét duyệt

- **WHEN** một người vào nhóm công khai · mở cửa bằng bấm tham gia rồi nhóm đổi sang công khai · xét duyệt
- **THEN** người đó vẫn không có quyền mang huy hiệu của nhóm

### Requirement: Người dùng xem huy hiệu mình được mang

Người dùng SHALL xem được danh sách nhóm mà mình đang có quyền mang huy hiệu, và MUST chỉ thấy đúng những
nhóm đó.

#### Scenario: Thành viên của hai nhóm

- **WHEN** một người là thành viên của hai nhóm nhưng chỉ có quyền mang huy hiệu của một nhóm
- **THEN** danh sách huy hiệu của người đó chỉ có nhóm ấy

### Requirement: Công tắc hiện tên nhóm trên tin sàn

Ở nhóm riêng tư, chủ nhóm hoặc master SHALL bật tắt được "hiện tên nhóm trên tin sàn". Nhóm công khai MUST NOT
có công tắc này.

#### Scenario: Bật ở nhóm công khai

- **WHEN** chủ của một nhóm công khai bật "hiện tên nhóm trên tin sàn"
- **THEN** response có HTTP 409 `GROUP_MODE_CONFLICT`

#### Scenario: Điều hành viên thử bật

- **WHEN** một điều hành viên của nhóm riêng tư bật "hiện tên nhóm trên tin sàn"
- **THEN** response có HTTP 403 `FORBIDDEN` và công tắc không đổi

### Requirement: Quyền huy hiệu được tính lại ngay

Quyền mang huy hiệu SHALL được tính lại ngay khi nhóm đổi chế độ, đổi cách vào hay đổi công tắc hiện tên —
không chờ một lượt chạy theo lịch.

#### Scenario: Nhóm xét duyệt đổi sang mở cửa

- **WHEN** nhóm công khai · xét duyệt đổi sang công khai · mở cửa
- **THEN** ngay sau đó không thành viên nào của nhóm còn quyền mang huy hiệu

#### Scenario: Nhóm mở cửa đổi sang xét duyệt

- **WHEN** nhóm công khai · mở cửa đổi sang công khai · xét duyệt
- **THEN** thành viên vào bằng lời mời có quyền mang huy hiệu ngay, thành viên vào bằng bấm tham gia thì không

#### Scenario: Tắt hiện tên

- **WHEN** chủ của nhóm riêng tư tắt "hiện tên nhóm trên tin sàn"
- **THEN** ngay sau đó không thành viên nào của nhóm còn quyền mang huy hiệu

### Requirement: Người ngoài bấm vào huy hiệu nhóm riêng tư chỉ thấy tên

Người không phải thành viên mở một nhóm riêng tư — chẳng hạn khi bấm vào huy hiệu trên một tin sàn — SHALL
chỉ thấy tên nhóm; mọi thông tin khác của nhóm MUST NOT hiện ra.

#### Scenario: Bấm huy hiệu nhóm riêng tư

- **WHEN** một người không phải thành viên bấm vào huy hiệu của một nhóm riêng tư đã bật hiện tên
- **THEN** response chỉ có tên nhóm

#### Scenario: Thành viên mở nhóm riêng tư

- **WHEN** một thành viên mở chính nhóm riêng tư của mình
- **THEN** response có HTTP 200 với hồ sơ nhóm, không chỉ tên nhóm

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
