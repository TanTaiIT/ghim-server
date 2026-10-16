# group/group-roles Specification

## Purpose

Định nghĩa vai chủ nhóm và điều hành viên — ai giao, ai nhận, khi nào tạm mất vai — và cách nhóm đi qua giai
đoạn thiếu chủ mà không hoạt động quá 30 ngày không có chủ (TK 5, TK 9, TK 10, cam kết 24).

## Requirements

### Requirement: Master giao chủ nhóm lần đầu

Master SHALL giao chủ cho một nhóm đang chờ giao chủ; người được giao MUST bấm đồng ý trong 14 ngày (giá trị
khởi đầu) mới thành chủ nhóm. Khi người đó đồng ý, nhóm sang đang hoạt động và người đó là thành viên với đường
vào "master giao". Lời giao hết hạn thì nhóm vẫn chờ giao chủ.

#### Scenario: Người được giao đồng ý

- **WHEN** master giao chủ nhóm cho Lan và Lan bấm đồng ý
- **THEN** Lan là chủ nhóm, là thành viên với đường vào "master giao", và nhóm sang đang hoạt động

#### Scenario: Chưa đồng ý

- **WHEN** master đã giao chủ nhóm cho Lan nhưng Lan chưa bấm đồng ý
- **THEN** nhóm vẫn chờ giao chủ và chưa ai vào được nhóm

#### Scenario: Người được giao từ chối

- **WHEN** Lan từ chối lời giao chủ
- **THEN** nhóm vẫn chờ giao chủ và master giao được cho người khác

#### Scenario: Đồng ý lời giao đã quá hạn

- **WHEN** Lan đồng ý lời giao chủ vào ngày thứ 15
- **THEN** response có HTTP 409 `INVITATION_EXPIRED` và nhóm vẫn chờ giao chủ

#### Scenario: Người dùng thử giao chủ

- **WHEN** một người dùng không phải master giao chủ một nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Tài khoản không tồn tại

- **WHEN** master giao chủ nhóm cho một mã tài khoản không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Chuyển nhượng chủ nhóm

Chủ nhóm SHALL chuyển được vai chủ cho một thành viên đủ điều kiện nhận vai; người nhận MUST bấm đồng ý trong
14 ngày (giá trị khởi đầu). Tới lúc người nhận đồng ý, chủ cũ vẫn là chủ; sau đó nhóm chỉ có một chủ là người
nhận, và chủ cũ là thành viên không có vai. Chủ nhóm SHALL huỷ được lời chuyển đang chờ.

#### Scenario: Người nhận đồng ý trong hạn

- **WHEN** chủ nhóm chuyển chủ cho Minh và Minh đồng ý vào ngày thứ 3
- **THEN** Minh là chủ nhóm, người chuyển vẫn là thành viên nhưng không có vai nào

#### Scenario: Người nhận đồng ý quá hạn

- **WHEN** Minh đồng ý lời chuyển chủ vào ngày thứ 15
- **THEN** response có HTTP 409 `INVITATION_EXPIRED` và người chuyển vẫn là chủ nhóm

#### Scenario: Người nhận từ chối

- **WHEN** Minh từ chối lời chuyển chủ
- **THEN** người chuyển vẫn là chủ nhóm

#### Scenario: Chuyển cho người ngoài nhóm

- **WHEN** chủ nhóm chuyển chủ cho một người không phải thành viên
- **THEN** response có HTTP 409 `NOT_GROUP_MEMBER`

#### Scenario: Huỷ lời chuyển

- **WHEN** chủ nhóm huỷ lời chuyển cho Minh rồi Minh bấm đồng ý
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và người chuyển vẫn là chủ nhóm

#### Scenario: Điều hành viên thử chuyển chủ

- **WHEN** một điều hành viên chuyển chủ nhóm cho người khác
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Bổ nhiệm và bãi nhiệm điều hành viên

Chủ nhóm hoặc master SHALL bổ nhiệm điều hành viên trong số thành viên của nhóm, phụ trách cả nhóm hoặc một
đơn vị con, và bãi nhiệm được điều hành viên. Người không phải thành viên MUST NOT được bổ nhiệm.

#### Scenario: Bổ nhiệm phụ trách một lớp

- **WHEN** chủ nhóm bổ nhiệm thành viên Bình làm điều hành viên phụ trách lớp 12A1
- **THEN** Bình là điều hành viên với phạm vi lớp 12A1

#### Scenario: Bổ nhiệm người ngoài nhóm

- **WHEN** chủ nhóm bổ nhiệm một người không phải thành viên làm điều hành viên
- **THEN** response có HTTP 409 `NOT_GROUP_MEMBER`

#### Scenario: Đơn vị con không thuộc nhóm

- **WHEN** chủ nhóm bổ nhiệm điều hành viên phụ trách một đơn vị con của nhóm khác
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Điều hành viên thử bổ nhiệm

- **WHEN** một điều hành viên bổ nhiệm người khác làm điều hành viên
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Bãi nhiệm

- **WHEN** chủ nhóm bãi nhiệm điều hành viên Bình
- **THEN** Bình vẫn là thành viên nhưng không còn làm được việc của điều hành viên

### Requirement: Tài khoản bị khoá tạm mất vai

Tài khoản bị khoá SHALL tạm mất vai chủ nhóm hay điều hành viên tới khi được mở khoá, và MUST NOT nhận vai
mới trong nhóm nào khi đang bị khoá.

#### Scenario: Điều hành viên bị khoá rồi mở khoá

- **WHEN** tài khoản của điều hành viên Bình bị khoá rồi được mở khoá, và trong lúc đó chủ nhóm không bãi
  nhiệm Bình
- **THEN** trong lúc bị khoá Bình không có vai điều hành viên; sau khi mở khoá vai trở lại đúng phạm vi cũ

#### Scenario: Giao vai cho tài khoản đang bị khoá

- **WHEN** master giao chủ nhóm, hoặc chủ nhóm bổ nhiệm điều hành viên, cho một tài khoản đang bị khoá
- **THEN** response có HTTP 409 `GROUP_ROLE_INELIGIBLE` kèm lý do "tài khoản đang bị khoá"

### Requirement: Chủ nhóm bị khoá thì nhóm thiếu chủ

Khi tài khoản chủ nhóm bị khoá, nhóm SHALL sang "thiếu chủ" ngay. Hệ thống SHALL đề cử điều hành viên cấp cả
nhóm nhận vai sớm nhất; không có ai cấp cả nhóm thì điều hành viên đơn vị con nhận vai sớm nhất. Master xác nhận
bằng cách giao chủ — cho người được đề cử hoặc một thành viên đủ điều kiện khác — và người đó MUST bấm đồng ý mới
thành chủ.

#### Scenario: Chủ nhóm bị khoá

- **WHEN** tài khoản chủ của một nhóm có điều hành viên cấp cả nhóm bị khoá
- **THEN** nhóm sang thiếu chủ, có một đề cử là điều hành viên cấp cả nhóm, và chưa ai là chủ nhóm

#### Scenario: Chỉ còn điều hành viên đơn vị con

- **WHEN** tài khoản chủ của một nhóm chỉ có điều hành viên phụ trách lớp 12A1 bị khoá
- **THEN** nhóm sang thiếu chủ, chưa tạm khoá, và người được đề cử là điều hành viên lớp 12A1

#### Scenario: Master chọn người khác đề cử

- **WHEN** master giao chủ nhóm đang thiếu chủ cho một thành viên không phải người được đề cử và người đó đồng ý
- **THEN** người đó là chủ nhóm và nhóm trở lại đang hoạt động

#### Scenario: Master xác nhận chủ mới

- **WHEN** master xác nhận chủ mới cho nhóm đang thiếu chủ và việc giao chủ hoàn tất
- **THEN** nhóm có chủ mới và trở lại đang hoạt động

#### Scenario: Người không phải master thử xác nhận

- **WHEN** một điều hành viên tự xác nhận mình làm chủ nhóm đang thiếu chủ
- **THEN** response có HTTP 403 `FORBIDDEN` và nhóm vẫn thiếu chủ

### Requirement: Chủ cũ trở lại khi được mở khoá trước

Nếu chủ cũ được mở khoá trước khi chủ mới được xác nhận, nhóm SHALL trở lại đang hoạt động với chủ cũ và đề
cử MUST bị huỷ.

#### Scenario: Mở khoá chủ cũ

- **WHEN** chủ cũ được mở khoá vào ngày thứ 10 của giai đoạn thiếu chủ, chưa có chủ mới
- **THEN** nhóm trở lại đang hoạt động với chủ cũ

#### Scenario: Xác nhận đề cử đã bị huỷ

- **WHEN** master xác nhận đề cử sau khi chủ cũ đã trở lại
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và chủ cũ vẫn là chủ nhóm

### Requirement: Thiếu chủ không quá 30 ngày

Nhóm thiếu chủ quá 30 ngày (giá trị khởi đầu) SHALL tự sang tạm khoá. Nhóm thiếu chủ mà không còn điều hành
viên nào ở mọi cấp SHALL sang tạm khoá ngay.

#### Scenario: Quá 30 ngày

- **WHEN** nhóm đã thiếu chủ 31 ngày và chưa có chủ
- **THEN** nhóm chuyển sang tạm khoá

#### Scenario: Có chủ trong hạn

- **WHEN** chủ mới được xác nhận vào ngày thứ 29 của giai đoạn thiếu chủ
- **THEN** nhóm trở lại đang hoạt động và không bị tạm khoá

#### Scenario: Điều hành viên cuối cùng rời nhóm

- **WHEN** điều hành viên cuối cùng của một nhóm đang thiếu chủ rời nhóm
- **THEN** nhóm chuyển sang tạm khoá ngay

#### Scenario: Nhóm không có điều hành viên nào

- **WHEN** tài khoản chủ của một nhóm không có điều hành viên nào bị khoá
- **THEN** nhóm chuyển sang tạm khoá ngay

### Requirement: Việc hằng ngày trong lúc thiếu chủ

Trong lúc thiếu chủ, điều hành viên SHALL tiếp tục việc hằng ngày trong phạm vi của mình. Quyền riêng của chủ
nhóm — đổi cài đặt, bổ nhiệm điều hành viên — MUST NOT chuyển sang ai trong nhóm; master không bị luật này chặn, trừ việc chuyển nhóm còn tin "nhóm công khai" sang riêng tư: việc đó chờ có chủ
(chốt 15/10/2026).

#### Scenario: Duyệt đơn khi thiếu chủ

- **WHEN** điều hành viên duyệt một đơn xin vào nhóm đang thiếu chủ
- **THEN** người xin thành thành viên

#### Scenario: Bổ nhiệm khi thiếu chủ

- **WHEN** điều hành viên cấp cả nhóm bổ nhiệm một điều hành viên mới trong lúc nhóm thiếu chủ
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Đổi cài đặt khi thiếu chủ

- **WHEN** điều hành viên cấp cả nhóm đổi chế độ nhóm trong lúc nhóm thiếu chủ
- **THEN** response có HTTP 403 `FORBIDDEN` và chế độ không đổi

#### Scenario: Master đổi chế độ khi thiếu chủ

- **WHEN** master đổi chế độ của một nhóm đang thiếu chủ
- **THEN** chế độ đổi như ở nhóm có chủ

#### Scenario: Master chuyển nhóm thiếu chủ sang riêng tư khi còn tin "nhóm công khai"

- **WHEN** master đổi một nhóm công khai đang thiếu chủ, còn tin "nhóm công khai", sang riêng tư
- **THEN** response có HTTP 409 `GROUP_OWNER_REQUIRED`, nhóm vẫn thiếu chủ và chế độ không đổi

### Requirement: Master giao chủ mới cho nhóm đang có chủ

Master SHALL giao chủ cho một thành viên đủ điều kiện của nhóm đang có chủ mà không cần chủ hiện tại đồng ý. Khi
người nhận đồng ý, chủ cũ MUST là thành viên không có vai.

#### Scenario: Master giao đè

- **WHEN** master giao chủ nhóm đang hoạt động cho Minh và Minh đồng ý
- **THEN** Minh là chủ nhóm và chủ cũ là thành viên không có vai

### Requirement: Khoá do hệ thống tự mở khi nhóm có chủ

Nhóm bị tạm khoá vì thiếu chủ quá hạn hay vì hết điều hành viên SHALL tự trở lại đang hoạt động ngay khi có chủ
nhóm dùng được: chủ cũ được mở khoá tài khoản, hoặc người nhận lời giao chủ của master. Nhóm do master khoá MUST
chỉ mở khi master mở khoá.

#### Scenario: Chủ cũ được mở khoá sau khi nhóm đã khoá

- **WHEN** nhóm đã tạm khoá vì thiếu chủ quá 30 ngày, rồi tài khoản chủ cũ được mở khoá
- **THEN** nhóm trở lại đang hoạt động với chủ cũ

#### Scenario: Người nhận lời giao của master

- **WHEN** nhóm đã tạm khoá vì thiếu chủ quá 30 ngày, master giao chủ cho một thành viên và người đó đồng ý
- **THEN** người đó là chủ nhóm và nhóm trở lại đang hoạt động

#### Scenario: Nhóm do master khoá

- **WHEN** master khoá một nhóm, rồi master giao chủ nhóm đó cho Minh và Minh đồng ý
- **THEN** Minh là chủ nhóm và nhóm vẫn tạm khoá

### Requirement: Nhận vai chủ nhóm hay điều hành viên cần mức T1 trở lên

Chỉ tài khoản đang ở mức T1 trở lên SHALL nhận được vai chủ nhóm hay điều hành viên. Bổ nhiệm điều hành viên,
hay bấm đồng ý nhận vai chủ nhóm — do master giao hoặc do chủ cũ chuyển nhượng — khi người nhận đang ở mức T0
MUST bị từ chối; mức được xét tại lúc người nhận thật sự nhận vai.

#### Scenario: Bổ nhiệm điều hành viên đang ở T0

- **WHEN** chủ nhóm bổ nhiệm một thành viên đang ở mức T0 làm điều hành viên
- **THEN** response có HTTP 409 `TRUST_TIER_TOO_LOW` và thành viên đó không có vai điều hành viên

#### Scenario: Bổ nhiệm điều hành viên đang ở T1

- **WHEN** chủ nhóm bổ nhiệm một thành viên đang ở mức T1 làm điều hành viên
- **THEN** thành viên đó có vai điều hành viên

#### Scenario: Nhận chuyển nhượng chủ nhóm khi đang ở T0

- **WHEN** người được chuyển nhượng vai chủ nhóm bấm đồng ý khi đang ở mức T0
- **THEN** response có HTTP 409 `TRUST_TIER_TOO_LOW` và chủ nhóm cũ vẫn giữ vai

#### Scenario: Tụt mức giữa lúc được giao và lúc đồng ý

- **WHEN** master giao chủ cho một nhóm mới lập cho người đang ở mức T1, rồi người đó bị tính lại về T0 trước
  khi bấm đồng ý
- **THEN** lượt bấm đồng ý nhận HTTP 409 `TRUST_TIER_TOO_LOW` và nhóm vẫn chờ giao chủ

#### Scenario: Nhận lời giao chủ khi đủ mức

- **WHEN** master giao chủ cho một nhóm mới lập và người được giao bấm đồng ý khi đang ở mức T1
- **THEN** người đó thành chủ nhóm

### Requirement: Tụt mức không làm mất vai đang giữ

Chủ nhóm hay điều hành viên bị tính lại xuống dưới T1 SHALL giữ vai đang có; mức chỉ được xét lúc nhận vai. Vai chỉ
mất theo các đường của group/group-roles — gậy nặng, tài khoản bị khoá (chốt 12/10/2026).

#### Scenario: Điều hành viên tụt về T0

- **WHEN** điều hành viên của nhóm X bị tính lại về T0 vì tin sạch duy nhất bị gỡ vì vi phạm
- **THEN** người đó vẫn là điều hành viên của nhóm X

### Requirement: Khoá, mở khoá chủ nhóm theo trạng thái hiện tại

Nhóm chuyển sang thiếu chủ hay trở lại với chủ cũ SHALL theo trạng thái hiện tại của tài khoản chủ: một lượt khoá
được hệ thống xử lại sau khi chủ đã được mở khoá MUST NOT làm nhóm thiếu chủ, và lượt mở khoá xử lại khi chủ đang
bị khoá MUST NOT trả nhóm cho chủ (chốt 15/10/2026).

#### Scenario: Lượt khoá chủ được xử lại sau khi mở khoá

- **WHEN** chủ nhóm bị khoá rồi được mở khoá, nhóm đã trở lại với chủ cũ, và hệ thống xử lại lượt khoá
- **THEN** nhóm vẫn đang hoạt động với chủ cũ, không có đề cử nào

### Requirement: Nhận làm chủ khi đang bị cấm

Người đang bị cấm khỏi một nhóm mà nhận lời giao chủ của nhóm đó thì lệnh cấm SHALL được gỡ như khi gỡ cấm: tin của
người đó trong nhóm MUST NOT còn bị ẩn vì lệnh cấm.

#### Scenario: Master giao chủ cho người đang bị cấm

- **WHEN** Minh bị cấm khỏi nhóm A lúc có một tin trong nhóm, rồi master giao chủ nhóm A cho Minh và Minh đồng ý
- **THEN** Minh là chủ nhóm A, không còn trong danh sách người bị cấm, và tin của Minh không còn bị ẩn vì lệnh cấm

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
