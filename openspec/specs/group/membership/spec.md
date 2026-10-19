# group/membership Specification

## Purpose

Định nghĩa cách một người vào nhóm theo chế độ của nhóm, đường vào được ghi lại và không đổi, ai xem được
danh sách thành viên, và các cách rời nhóm (TK 10).

## Requirements

### Requirement: Nhóm chờ giao chủ, tạm khoá hay đã đóng không nhận thành viên

Nhóm đang chờ giao chủ, đang tạm khoá hay đã đóng MUST NOT nhận thành viên mới qua bất kỳ đường nào — tham
gia, duyệt đơn, lời mời hay danh sách lớp.

#### Scenario: Tham gia nhóm chờ giao chủ

- **WHEN** một người dùng tham gia một nhóm công khai · mở cửa còn đang chờ giao chủ
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và người đó không thành thành viên

#### Scenario: Tham gia nhóm tạm khoá

- **WHEN** một người dùng tham gia một nhóm công khai · mở cửa đang tạm khoá
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT`

### Requirement: Tài khoản master không vào nhóm

Tài khoản master MUST NOT vào nhóm hay nhận vai trong nhóm qua bất kỳ đường nào. Người làm master muốn vào
nhóm SHALL dùng tài khoản cá nhân như mọi người dùng.

#### Scenario: Master bấm tham gia

- **WHEN** một tài khoản master tham gia một nhóm công khai · mở cửa
- **THEN** response có HTTP 403 `FORBIDDEN` và tài khoản đó không thành thành viên

#### Scenario: Giao chủ nhóm cho tài khoản master

- **WHEN** master giao chủ một nhóm cho một tài khoản master
- **THEN** response có HTTP 409 `GROUP_ROLE_INELIGIBLE`

### Requirement: Người bị cấm không vào lại

Người đã bị cấm khỏi một nhóm MUST NOT vào lại nhóm đó qua bất kỳ đường nào. Việc này SHALL được xét trước
mọi đường vào khác.

#### Scenario: Bị cấm rồi bấm tham gia

- **WHEN** người đã bị cấm tham gia lại nhóm công khai · mở cửa đó
- **THEN** response có HTTP 403 `GROUP_BANNED`

#### Scenario: Bị cấm rồi nhận lời mời

- **WHEN** người đã bị cấm nhận một lời mời còn hạn của chính nhóm đó
- **THEN** response có HTTP 403 `GROUP_BANNED` và người đó không thành thành viên

#### Scenario: Bị cấm rồi gửi đơn

- **WHEN** người đã bị cấm gửi đơn vào nhóm công khai · xét duyệt đó
- **THEN** response có HTTP 403 `GROUP_BANNED`

### Requirement: Nhóm mở cửa thì bấm tham gia là vào

Ở nhóm công khai · mở cửa, người dùng SHALL vào ngay khi bấm tham gia, với đường vào "bấm tham gia".

#### Scenario: Tham gia nhóm mở cửa

- **WHEN** một người dùng tham gia một nhóm công khai · mở cửa đang hoạt động
- **THEN** người đó thành thành viên ngay với đường vào "bấm tham gia"

#### Scenario: Đã là thành viên

- **WHEN** một thành viên tham gia lại chính nhóm mình đang ở
- **THEN** response có HTTP 409 `ALREADY_MEMBER`

### Requirement: Nhóm xét duyệt và nhóm có mã thì gửi đơn

Ở nhóm công khai · xét duyệt và riêng tư · có mã, người dùng SHALL gửi đơn để vào; đơn vào nhóm có mã MUST
kèm đúng mã nhóm. Điều hành viên, chủ nhóm hoặc master duyệt thì người xin vào với đường vào "được duyệt";
từ chối thì không vào.

#### Scenario: Gửi đơn

- **WHEN** một người dùng gửi đơn vào nhóm công khai · xét duyệt
- **THEN** response có HTTP 201 và đơn ở trạng thái chờ

#### Scenario: Đơn được duyệt

- **WHEN** điều hành viên duyệt đơn đang chờ
- **THEN** người xin thành thành viên với đường vào "được duyệt"

#### Scenario: Đơn bị từ chối

- **WHEN** điều hành viên từ chối đơn đang chờ
- **THEN** người xin không thành thành viên và đơn chuyển sang bị từ chối

#### Scenario: Nhập sai mã nhóm

- **WHEN** một người dùng nhập một mã không thuộc nhóm nào
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Gửi đơn trùng

- **WHEN** người dùng gửi đơn thứ hai vào cùng một nhóm trong lúc đơn đầu còn chờ
- **THEN** response có HTTP 409 `CONFLICT`

#### Scenario: Thành viên thường thử duyệt đơn

- **WHEN** một thành viên không có vai trong nhóm duyệt một đơn
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Điều hành viên đơn vị con thử duyệt đơn

- **WHEN** một điều hành viên phụ trách lớp 12A1 duyệt một đơn xin vào nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Người xin rút đơn

- **WHEN** người xin rút đơn đang chờ của mình
- **THEN** đơn không còn duyệt được và không còn tính vào số đơn đang chờ của người đó

#### Scenario: Hai người cùng xử một đơn

- **WHEN** hai điều hành viên cùng lúc duyệt và từ chối một đơn đang chờ
- **THEN** đúng một lượt thành công, lượt kia nhận HTTP 409 `CONFLICT`

### Requirement: Đơn tự huỷ khi quá hạn

Đơn chưa được xử SHALL tự huỷ sau 21 ngày (giá trị khởi đầu). Đơn đã huỷ MUST NOT duyệt được nữa và không
còn tính vào số đơn đang chờ.

#### Scenario: Duyệt đơn ngày thứ 20

- **WHEN** điều hành viên duyệt một đơn đã gửi 20 ngày
- **THEN** người xin thành thành viên

#### Scenario: Duyệt đơn đã quá hạn

- **WHEN** điều hành viên duyệt một đơn đã gửi 22 ngày
- **THEN** response có HTTP 409 `JOIN_REQUEST_EXPIRED` và người xin không thành thành viên

### Requirement: Chờ trước khi gửi lại đơn bị từ chối

Người bị từ chối SHALL chỉ gửi lại đơn vào cùng nhóm sau 7 ngày (giá trị khởi đầu) kể từ lúc bị từ chối.
Đơn tự huỷ vì quá hạn MUST NOT bị tính là bị từ chối.

#### Scenario: Gửi lại quá sớm

- **WHEN** người bị từ chối 3 ngày trước gửi lại đơn vào nhóm đó
- **THEN** response có HTTP 429 `JOIN_REQUEST_TOO_SOON` kèm thời điểm được gửi lại

#### Scenario: Gửi lại sau 7 ngày

- **WHEN** người bị từ chối 8 ngày trước gửi lại đơn vào nhóm đó
- **THEN** response có HTTP 201 và đơn mới ở trạng thái chờ

#### Scenario: Đơn cũ tự huỷ

- **WHEN** đơn của một người vừa tự huỷ vì quá hạn và người đó gửi lại đơn vào nhóm đó
- **THEN** response có HTTP 201 và đơn mới ở trạng thái chờ

### Requirement: Tối đa ba đơn đang chờ

Mỗi người SHALL có tối đa 3 đơn đang chờ (giá trị khởi đầu), tính trên mọi nhóm cộng lại.

#### Scenario: Đơn thứ tư

- **WHEN** người dùng đang có 3 đơn chờ ở ba nhóm và gửi đơn vào nhóm thứ tư
- **THEN** response có HTTP 409 `JOIN_REQUEST_LIMIT`

#### Scenario: Một đơn đã được xử

- **WHEN** một trong 3 đơn chờ được duyệt và người đó gửi đơn vào nhóm thứ tư
- **THEN** response có HTTP 201

### Requirement: Lời mời

Điều hành viên, chủ nhóm hoặc master SHALL mời được một người vào nhóm bằng email của tài khoản người đó; điều
hành viên đơn vị con chỉ mời vào đơn vị mình. Response MUST giống hệt nhau dù email có thuộc tài khoản nào hay
không, để không ai dò được email nào đã có tài khoản. Lời mời có hạn 14 ngày (giá trị khởi đầu); người được mời
nhận lời còn hạn thì SHALL vào nhóm với đường vào "lời mời", kèm đơn vị ghi trong lời mời nếu có.

#### Scenario: Nhận lời còn hạn

- **WHEN** người được mời nhận lời vào ngày thứ 10
- **THEN** người đó thành thành viên với đường vào "lời mời"

#### Scenario: Nhận lời quá hạn

- **WHEN** người được mời nhận lời vào ngày thứ 15
- **THEN** response có HTTP 409 `INVITATION_EXPIRED` và người đó không thành thành viên

#### Scenario: Thành viên thường thử mời

- **WHEN** một thành viên không có vai trong nhóm mời một người khác
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Mời email không có tài khoản

- **WHEN** điều hành viên mời một email chưa thuộc tài khoản nào
- **THEN** response giống hệt khi mời một email có tài khoản, và không ai nhận được lời mời

#### Scenario: Điều hành viên đơn vị mời vào lớp mình

- **WHEN** điều hành viên phụ trách lớp 12A1 mời An và An nhận lời
- **THEN** An là thành viên với đường vào "lời mời" và thuộc lớp 12A1

### Requirement: Nhóm chỉ lời mời

Ở nhóm riêng tư · chỉ lời mời, người dùng SHALL chỉ vào được bằng lời mời còn hạn hoặc khi có tên trong danh
sách lớp của nhóm. Người vào theo danh sách lớp MUST mang đường vào "danh sách lớp".

#### Scenario: Không có lời mời, không có tên

- **WHEN** một người không có lời mời và không có tên trong danh sách lớp xin vào nhóm chỉ lời mời
- **THEN** response có HTTP 403 `INVITATION_REQUIRED`

#### Scenario: Có tên trong danh sách lớp

- **WHEN** một người có tên trong danh sách lớp của nhóm xin vào
- **THEN** người đó thành thành viên với đường vào "danh sách lớp"

### Requirement: Mã nhóm

Nhóm riêng tư · có mã SHALL có một mã nhóm 6 ký tự (giá trị khởi đầu). Chủ nhóm hoặc master SHALL đổi được
mã khi bị lộ, và mã cũ MUST hết hiệu lực ngay.

#### Scenario: Đổi mã bị lộ

- **WHEN** chủ nhóm đổi mã nhóm
- **THEN** nhập mã cũ nhận HTTP 404 `NOT_FOUND`, còn nhập mã mới thấy nhóm và gửi được đơn

### Requirement: Đường vào được ghi lại và không đổi

Hệ thống SHALL ghi đường vào của mỗi thành viên: bấm tham gia, được duyệt, lời mời, danh sách lớp hoặc
master giao. Đường vào MUST NOT đổi về sau, kể cả khi nhóm đổi chế độ; chỉ người rời rồi vào lại mới có
đường vào mới.

#### Scenario: Nhóm đổi chế độ sau khi đã vào

- **WHEN** một người vào bằng bấm tham gia rồi nhóm đổi sang công khai · xét duyệt
- **THEN** đường vào của người đó vẫn là "bấm tham gia"

#### Scenario: Vào lại bằng đường khác

- **WHEN** một người vào bằng bấm tham gia, bị gỡ, rồi vào lại bằng lời mời
- **THEN** đường vào của người đó là "lời mời"

### Requirement: Đơn vị con

Nhóm loại trường học và công ty SHALL có đơn vị con (lớp, phòng ban); nhóm cộng đồng và khác MUST NOT có. Chủ
nhóm hoặc master SHALL lập, đổi tên và xoá đơn vị; đơn vị còn thành viên MUST NOT xoá được. Chủ nhóm, điều hành
viên cả nhóm và master SHALL xếp thành viên vào đơn vị. Mỗi thành viên MUST thuộc tối đa một đơn vị con tại một
thời điểm.

#### Scenario: Xếp thành viên vào lớp

- **WHEN** chủ của một nhóm trường học có lớp 12A1 và 12A2 xếp thành viên An vào lớp 12A1
- **THEN** An thuộc lớp 12A1

#### Scenario: Chuyển sang lớp khác

- **WHEN** An đang thuộc lớp 12A1 được xếp vào lớp 12A2
- **THEN** An chỉ thuộc lớp 12A2

#### Scenario: Đơn vị không thuộc nhóm

- **WHEN** chủ nhóm xếp một thành viên vào một đơn vị con của nhóm khác
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Xoá đơn vị còn thành viên

- **WHEN** chủ nhóm xoá lớp 12A1 đang có một thành viên
- **THEN** response có HTTP 409 `GROUP_UNIT_NOT_EMPTY` và lớp vẫn còn

#### Scenario: Đơn vị con ở nhóm cộng đồng

- **WHEN** chủ của một nhóm cộng đồng lập một đơn vị con
- **THEN** response có HTTP 409 `GROUP_KIND_CONFLICT`

#### Scenario: Thành viên thường thử xếp lớp

- **WHEN** một thành viên không có vai trong nhóm xếp người khác vào một đơn vị con
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Danh sách thành viên

Danh sách thành viên của nhóm SHALL chỉ chủ nhóm, điều hành viên và master xem được, ở mọi chế độ của nhóm.

#### Scenario: Điều hành viên xem danh sách

- **WHEN** một điều hành viên xem danh sách thành viên của nhóm mình
- **THEN** response có HTTP 200 với danh sách thành viên

#### Scenario: Thành viên thường ở nhóm công khai

- **WHEN** một thành viên không có vai xem danh sách thành viên của một nhóm công khai · mở cửa
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Khách xem danh sách

- **WHEN** khách chưa đăng nhập xem danh sách thành viên của một nhóm công khai
- **THEN** response có HTTP 401 `UNAUTHORIZED`

### Requirement: Tự rời nhóm

Thành viên SHALL tự rời được nhóm và vào lại theo cách vào hiện tại của nhóm. Chủ nhóm MUST chuyển chủ xong
mới rời được.

#### Scenario: Rời rồi vào lại nhóm mở cửa

- **WHEN** một thành viên rời nhóm công khai · mở cửa rồi tham gia lại
- **THEN** người đó thành thành viên lại với đường vào "bấm tham gia"

#### Scenario: Điều hành viên rời nhóm

- **WHEN** một điều hành viên rời nhóm
- **THEN** người đó không còn là thành viên, cũng không còn vai điều hành viên

#### Scenario: Chủ nhóm thử rời

- **WHEN** chủ nhóm rời nhóm khi chưa chuyển chủ cho ai
- **THEN** response có HTTP 409 `GROUP_OWNER_MUST_TRANSFER` và người đó vẫn là chủ nhóm

### Requirement: Gỡ thành viên

Điều hành viên, chủ nhóm hoặc master SHALL gỡ được một thành viên khỏi nhóm; người bị gỡ vào lại như người
mới theo cách vào hiện tại của nhóm. Chủ nhóm MUST NOT bị gỡ hay bị cấm khỏi nhóm của mình. Điều hành viên MUST NOT
gỡ hay cấm điều hành viên khác; điều hành viên đơn vị con chỉ gỡ, cấm thành viên của đơn vị mình.

#### Scenario: Gỡ ở nhóm xét duyệt

- **WHEN** điều hành viên gỡ một thành viên của nhóm công khai · xét duyệt
- **THEN** người đó không còn là thành viên và phải gửi đơn mới nếu muốn vào lại

#### Scenario: Điều hành viên thử gỡ chủ nhóm

- **WHEN** một điều hành viên gỡ hoặc cấm chủ nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và chủ nhóm vẫn ở nhóm

#### Scenario: Điều hành viên gỡ điều hành viên khác

- **WHEN** một điều hành viên gỡ một điều hành viên khác của nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và người kia vẫn là điều hành viên

#### Scenario: Điều hành viên đơn vị gỡ người ngoài đơn vị

- **WHEN** điều hành viên phụ trách lớp 12A1 gỡ một thành viên thuộc lớp 12A2
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Thành viên thường thử gỡ người khác

- **WHEN** một thành viên không có vai trong nhóm gỡ một thành viên khác
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Cấm khỏi nhóm chỉ có tác dụng trong nhóm đó

Điều hành viên, chủ nhóm hoặc master SHALL cấm được một người, kể cả người chưa từng là thành viên; người bị
cấm mất tư cách thành viên ngay. Lệnh cấm MUST chỉ có tác dụng trong nhóm đó, không đổi gì trên tài khoản toàn hệ
thống.

#### Scenario: Cấm một thành viên

- **WHEN** điều hành viên cấm một thành viên khỏi nhóm A
- **THEN** người đó không còn là thành viên của nhóm A

#### Scenario: Cấm người chưa từng vào nhóm

- **WHEN** điều hành viên cấm một người chưa từng là thành viên, rồi người đó tham gia nhóm công khai · mở cửa ấy
- **THEN** response có HTTP 403 `GROUP_BANNED`

#### Scenario: Bị cấm ở nhóm này, vào nhóm khác

- **WHEN** người bị cấm khỏi nhóm A tham gia một nhóm công khai · mở cửa B
- **THEN** người đó thành thành viên của nhóm B, và tài khoản không bị khoá hay đánh dấu gì

### Requirement: Danh sách lớp

Chủ nhóm, điều hành viên cả nhóm hoặc master SHALL nạp được danh sách email của những người được vào nhóm, mỗi
email kèm một đơn vị con tuỳ chọn. Hệ thống MUST chỉ lưu dấu băm của email đã chuẩn hoá. Người có tên trong danh
sách SHALL vào được ngay ở mọi chế độ đang nhận người, với đường vào "danh sách lớp" và thuộc đơn vị ghi kèm.

#### Scenario: Có tên kèm lớp

- **WHEN** danh sách lớp có email của An kèm lớp 12A1 và An xin vào nhóm công khai · xét duyệt đó
- **THEN** An thành thành viên ngay, không qua đơn, với đường vào "danh sách lớp" và thuộc lớp 12A1

#### Scenario: Điều hành viên đơn vị thử nạp danh sách

- **WHEN** điều hành viên phụ trách lớp 12A1 nạp danh sách lớp
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Gỡ cấm

Chủ nhóm, điều hành viên cả nhóm hoặc master SHALL gỡ được lệnh cấm; người được gỡ cấm vào lại theo cách vào hiện
tại của nhóm như người mới.

#### Scenario: Gỡ cấm rồi vào lại

- **WHEN** chủ nhóm gỡ cấm một người rồi người đó tham gia nhóm công khai · mở cửa ấy
- **THEN** người đó thành thành viên với đường vào "bấm tham gia"

#### Scenario: Thành viên thường thử gỡ cấm

- **WHEN** một thành viên không có vai gỡ cấm cho một người
- **THEN** response có HTTP 403 `FORBIDDEN`

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

### Requirement: Mời lại khi lời mời còn chờ

Mời lại một email đang có lời mời chờ trong nhóm SHALL không tạo lời mời thứ hai: lời mời đang chờ lấy đơn vị của lượt
mời mới và giữ hạn cũ (chốt 16/10/2026).

#### Scenario: Mời lại với đơn vị khác

- **WHEN** chủ nhóm mời An vào lớp 12A1, rồi khi lời mời còn chờ, mời lại An vào lớp 12A2, và An nhận lời
- **THEN** An là thành viên thuộc lớp 12A2, và nhóm chỉ có một lời mời chờ cho An trước lúc nhận

### Requirement: Danh sách lời mời đang chờ

Chủ nhóm, điều hành viên hoặc master SHALL xem được các lời mời đang chờ của nhóm: email đã che (ký tự đầu và miền),
đơn vị, lúc mời, hạn — đủ để thu hồi một lời mời gửi nhầm. Mỗi lượt mời MUST có đúng một dòng như nhau dù email có
thuộc tài khoản nào, đã ở nhóm hay không, để danh sách không lộ email nào đã có tài khoản (TK 10). Điều hành viên đơn
vị con chỉ thấy lời mời vào đơn vị mình.

#### Scenario: Xem rồi thu hồi lời mời gửi nhầm

- **WHEN** chủ nhóm mời nhầm `binh@truong.vn`, xem danh sách lời mời, rồi thu hồi dòng `b***@truong.vn`
- **THEN** dòng đó có trong danh sách với đơn vị và hạn, thu hồi trả HTTP 204, và Bình không còn lời mời nào

#### Scenario: Email chưa có tài khoản cũng có một dòng

- **WHEN** chủ nhóm mời một email có tài khoản và một email chưa có tài khoản
- **THEN** danh sách có hai dòng cùng các trường như nhau, không trường nào cho biết email nào đã có tài khoản

#### Scenario: Điều hành viên đơn vị chỉ thấy đơn vị mình

- **WHEN** nhóm có lời mời vào lớp 12A1 và lớp 12A2, điều hành viên phụ trách lớp 12A1 xem danh sách
- **THEN** chỉ thấy lời mời vào lớp 12A1

#### Scenario: Thành viên thường xem danh sách lời mời

- **WHEN** một thành viên không có vai xem danh sách lời mời
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Danh sách người bị cấm

Chủ nhóm, điều hành viên cả nhóm hoặc master SHALL xem được những người đang bị cấm khỏi nhóm — tên hiển thị, lúc cấm,
người cấm — để gỡ cấm được trên app.

#### Scenario: Xem rồi gỡ cấm

- **WHEN** chủ nhóm cấm Bình, xem danh sách người bị cấm, rồi gỡ cấm Bình
- **THEN** Bình có trong danh sách kèm lúc cấm, gỡ cấm trả HTTP 204, và Bình không còn trong danh sách

#### Scenario: Điều hành viên đơn vị xem danh sách người bị cấm

- **WHEN** điều hành viên phụ trách lớp 12A1 xem danh sách người bị cấm
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Huỷ kèm theo vẫn báo

Đơn xin vào, lời mời, lời giao chủ bị hệ thống huỷ kèm theo một việc khác — người đó vào nhóm bằng đường khác, bị cấm,
tài khoản bị xoá, nhóm tạm khoá vì không còn ai giữ — SHALL được báo như khi huỷ bằng tay: quản trị nhóm nhận số đơn đang
chờ mới. Người chưa là thành viên nhận lời giao chủ thì đơn và lời mời còn chờ của họ ở nhóm đó SHALL bị huỷ.

#### Scenario: Có đơn chờ rồi vào bằng lời mời

- **WHEN** Lan đang có đơn chờ vào nhóm A, rồi nhận lời mời vào nhóm A
- **THEN** Lan là thành viên, đơn của Lan bị huỷ, và kết nối của chủ nhóm A nhận số đơn đang chờ mới

#### Scenario: Cấm người đang có đơn và lời mời

- **WHEN** chủ nhóm cấm một người đang có đơn chờ và lời mời chờ ở nhóm
- **THEN** đơn và lời mời của người đó bị huỷ, và kết nối của chủ nhóm nhận số đơn đang chờ mới

#### Scenario: Người ngoài nhận lời giao chủ

- **WHEN** Lan đang có đơn chờ vào nhóm A, rồi nhận lời master giao chủ nhóm A
- **THEN** Lan là chủ nhóm A và đơn của Lan bị huỷ

### Requirement: Người xin thấy đơn đang chờ của mình

Hồ sơ nhóm SHALL kèm đơn đang chờ của chính người xem ở nhóm đó — mã đơn, lúc gửi, hạn tự huỷ — để người xin biết đã
gửi và rút được đơn. Đơn MUST hiện cả khi hồ sơ chỉ có tên nhóm. Hồ sơ MUST NOT kèm đơn của người khác, và MUST NOT kèm
đơn đã được duyệt, bị từ chối, đã rút hay đã quá hạn.

#### Scenario: Vừa gửi đơn vào nhóm xét duyệt

- **WHEN** một người dùng gửi đơn vào nhóm công khai · xét duyệt rồi mở hồ sơ nhóm
- **THEN** hồ sơ kèm đơn đang chờ của người đó, đúng mã đơn và hạn tự huỷ của đơn

#### Scenario: Đơn vào nhóm có mã

- **WHEN** một người ngoài gửi đơn vào nhóm riêng tư · có mã bằng đúng mã nhóm rồi mở hồ sơ nhóm
- **THEN** hồ sơ chỉ có tên nhóm và đơn đang chờ của người đó

#### Scenario: Chưa gửi đơn

- **WHEN** một người dùng chưa gửi đơn mở hồ sơ một nhóm công khai · xét duyệt
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Người khác xem

- **WHEN** khách, hoặc một người dùng khác, mở hồ sơ của nhóm mà một người đang có đơn chờ
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Đơn đã rút

- **WHEN** người xin rút đơn rồi mở hồ sơ nhóm
- **THEN** hồ sơ không kèm đơn nào

#### Scenario: Đơn được duyệt

- **WHEN** điều hành viên duyệt đơn và người xin mở hồ sơ nhóm
- **THEN** hồ sơ cho biết người đó là thành viên và không kèm đơn nào

#### Scenario: Đơn đã quá hạn

- **WHEN** người xin mở hồ sơ nhóm khi đơn đã gửi 22 ngày mà chưa ai xử
- **THEN** hồ sơ không kèm đơn nào
