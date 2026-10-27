# review/queues Specification

## Purpose

Gom mọi việc cần người xử vào sáu hàng chờ có hạn xử, giữ mỗi tin tối đa một việc đang mở, và bảo đảm việc
quá hạn chỉ được chuyển cấp chứ không bao giờ tự mở tin (TK 16, nguyên tắc 2 và 6).

## Requirements

### Requirement: Sáu hàng chờ, mỗi hàng một hạn xử

Mỗi việc SHALL nằm trong đúng một hàng và mang hạn xử tính từ lúc vào hàng (giá trị khởi đầu): hàng 0 máy
giữ — 24 giờ; hàng 1 báo cáo — 72 giờ; hàng 2 khiếu nại gậy — 7 ngày; hàng 3 hiển thị hạn chế do máy — 72
giờ; hàng 4 chuyển từ nhóm — 72 giờ; hàng 5 mẫu hậu kiểm — 7 ngày.

#### Scenario: Hạn xử của việc máy giữ

- **WHEN** một việc vào hàng 0 lúc 10:00 ngày 1
- **THEN** hạn xử của việc là 10:00 ngày 2

#### Scenario: Hạn xử của việc chuyển từ nhóm

- **WHEN** một việc vào hàng 4 lúc 08:00 thứ Hai
- **THEN** hạn xử của việc là 08:00 thứ Năm

#### Scenario: Hạn xử của mẫu hậu kiểm

- **WHEN** một việc vào hàng 5 lúc 08:00 ngày 1
- **THEN** hạn xử của việc là 08:00 ngày 8

### Requirement: Máy giữ hay hạn chế một tin thì sinh việc

Mỗi lần máy giữ một tin cho người — lúc gửi, lúc gửi lại sau khi sửa, hay khi máy rút một tin đang hiển thị
về chờ duyệt vì một cụm từ cấm vừa bật thật — hệ thống SHALL sinh một việc hàng 0 về tin đó. Mỗi lần máy cho một tin qua kèm lý do hạn chế "máy",
hệ thống SHALL sinh một việc hàng 3; tin vẫn hiển thị hạn chế trong lúc chờ. Lưới an toàn chuyển một tin đang
hiện thiếu kết quả ảnh sang hạn chế thì hệ thống SHALL sinh một việc hàng 3 về tin đó (chốt 15/10/2026).

#### Scenario: Máy giữ tin lúc gửi

- **WHEN** máy giữ một tin vừa gửi
- **THEN** có một việc hàng 0 về tin đó và tin ở trạng thái chờ duyệt

#### Scenario: Tin của T1 ở dải Vừa

- **WHEN** máy cho một tin của tài khoản T1 qua ở mức hạn chế vì điểm rủi ro thuộc dải Vừa
- **THEN** có một việc hàng 3 về tin đó và tin hiển thị hạn chế ngay, không đợi việc được xử

#### Scenario: Cụm từ cấm mới rút tin đang hiện về

- **WHEN** master bật thật một cụm từ cấm mới và một tin đang hiện chứa cụm đó bị rút về chờ duyệt
- **THEN** có một việc hàng 0 về tin đó

#### Scenario: Lưới an toàn gặp tin thiếu kết quả ảnh

- **WHEN** lưới an toàn chuyển một tin đang hiện thiếu kết quả ảnh sang hiển thị hạn chế
- **THEN** tin có một việc hàng 3 đang mở để người xem lại

### Requirement: Việc vào hàng của ai

Việc hàng 0 và hàng 5 về tin sàn SHALL vào hàng staff được giao danh mục của tin, không theo khu vực; về tin trong nhóm
thì vào hàng của điều hành nhóm phụ trách phạm vi của tin, trừ việc hàng 0 về tin nhóm thuộc danh mục đặt "tin nhóm bị
giữ do sàn duyệt" (kể cả nhóm riêng tư; trừ việc nhóm duyệt tay) vào hàng staff được giao danh mục. Việc hàng 3, 4 SHALL
vào hàng staff được giao danh mục của tin. Danh mục chưa có staff thì việc vào hàng master. Master SHALL thấy và xử được
mọi việc.

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

### Requirement: Việc giữ vì nhóm duyệt tay về nhóm

Việc hàng 0 mà máy giữ chỉ vì nhóm bật "duyệt tay mọi tin" (`group/manual-review`) SHALL vào chuỗi của nhóm như mọi việc
của nhóm, kể cả khi danh mục đặt "tin nhóm bị giữ do sàn duyệt".

#### Scenario: Nhóm duyệt tay ở danh mục do sàn duyệt

- **WHEN** danh mục Thú cưng đặt "tin nhóm bị giữ do sàn duyệt", nhóm bật "duyệt tay mọi tin", và một tin Thú cưng
  máy cho qua được gửi vào nhóm
- **THEN** việc hàng 0 hiện trong hàng của quản trị nhóm và không hiện trong hàng của staff được giao Thú cưng

### Requirement: Quyền master với việc chỉ dùng ở bàn vận hành

Ở các thao tác hàng chờ của nhóm, master MUST NOT mang quyền master. Ở đó chỉ vai trong nhóm được tính, mà master không
vào nhóm nào (TK 5). Master SHALL thấy và xử mọi việc, kể cả việc của nhóm, ở bàn vận hành (chốt 15/10/2026).

#### Scenario: Master mở việc của nhóm qua thao tác của nhóm

- **WHEN** master xem hay nhận một việc về tin trong nhóm bằng thao tác hàng chờ của nhóm đó
- **THEN** response có HTTP 404 `NOT_FOUND` và việc không đổi

#### Scenario: Master xem hàng chờ của nhóm

- **WHEN** master xem hàng chờ của một nhóm bằng thao tác hàng chờ của nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Master xử việc của nhóm ở bàn vận hành

- **WHEN** master nhận và quyết một việc về tin trong nhóm ở bàn vận hành
- **THEN** quyết định được ghi dưới vai master

### Requirement: Xem hàng chờ

Người có quyền xử SHALL xem được hàng chờ gồm mọi việc mình được xử, mỗi việc nêu số hàng, các lý do và hạn
xử. Người không có quyền xử việc nào MUST NOT xem được hàng chờ.

#### Scenario: Staff xem hàng chờ

- **WHEN** staff xem hàng chờ của mình
- **THEN** response có HTTP 200, mỗi việc kèm số hàng, các lý do và hạn xử

#### Scenario: Người dùng thường xem hàng chờ

- **WHEN** một người dùng không mang vai điều hành nhóm hay quyền staff gọi xem hàng chờ
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Khách xem hàng chờ

- **WHEN** khách chưa đăng nhập gọi xem hàng chờ
- **THEN** response có HTTP 401 `UNAUTHORIZED`

### Requirement: Một tin, một việc đang mở

Mỗi tin SHALL có tối đa một việc đang mở. Việc mới về một tin đang có việc mở MUST được gộp vào việc đó: thêm
lý do, hạn xử lấy hạn sớm nhất, người xử theo hàng có số nhỏ nhất trong các lý do.

#### Scenario: Tin đang hậu kiểm bị máy rút về

- **WHEN** tin có việc hàng 5 còn 6 ngày hạn bị máy rút về chờ duyệt
- **THEN** tin vẫn chỉ có một việc mở, việc đó thêm lý do máy giữ, nằm ở hàng 0 và có hạn xử 24 giờ kể từ
  lúc rút về

#### Scenario: Hạn cũ sớm hơn thì giữ hạn cũ

- **WHEN** tin sàn có việc hàng 3 còn 2 giờ hạn, người đăng sửa tin và máy giữ bản sửa
- **THEN** việc đó thêm lý do máy giữ, nằm ở hàng 0 và hạn xử vẫn là 2 giờ còn lại

#### Scenario: Hai việc sinh cùng lúc

- **WHEN** lượt lấy mẫu hậu kiểm và lượt máy giữ bản sửa cùng sinh việc về một tin trong cùng một lúc
- **THEN** tin chỉ có một việc đang mở

### Requirement: Máy cho bản sửa qua thì bỏ lý do của máy

Khi người đăng sửa một tin đang có việc mở và máy cho bản sửa qua, lý do "máy giữ" SHALL bị bỏ; máy cho qua ở mức đầy
đủ thì lý do "hạn chế do máy" cũng SHALL bị bỏ. Máy vẫn giữ hay vẫn hạn chế bản sửa thì lý do tương ứng còn nguyên và
hạn xử MUST NOT được kéo dài (chốt 15/10/2026).

#### Scenario: Sửa xong máy cho qua

- **WHEN** tin đang chờ duyệt chỉ vì máy giữ, người đăng sửa và máy cho bản sửa qua
- **THEN** việc về tin đó bị huỷ và không còn trong hàng chờ của ai

#### Scenario: Sửa xong máy vẫn giữ

- **WHEN** tin đang chờ duyệt còn 5 giờ hạn, người đăng sửa và máy giữ bản sửa
- **THEN** tin vẫn chỉ có một việc mở và hạn xử vẫn là 5 giờ còn lại

#### Scenario: Tin hạn chế do máy được sửa và máy cho qua đầy đủ

- **WHEN** tin của T1 đang hiển thị hạn chế với việc hàng 3, người đăng sửa và máy cho bản sửa qua ở mức đầy đủ
- **THEN** việc hàng 3 bị huỷ

### Requirement: Bản sửa bỏ lý do mẫu hậu kiểm

Mỗi bản sửa của người đăng SHALL bỏ lý do "mẫu hậu kiểm" của việc về tin đó: nội dung đã khác bản được chọn mẫu, và
bản mới khi lên bảng được xét lấy mẫu lại (chốt 15/10/2026).

#### Scenario: Tin đang trong mẫu hậu kiểm được sửa

- **WHEN** tin có việc hàng 5 được người đăng sửa và máy cho bản sửa qua
- **THEN** việc hàng 5 bị huỷ và không được đếm vào số "bỏ sót"

### Requirement: Việc hết lý do thì huỷ, còn lý do thì xếp lại

Việc không còn lý do nào SHALL bị huỷ. Việc còn lý do SHALL xếp lại hàng và người xử theo các lý do còn lại, giữ
nguyên hạn xử (chốt 15/10/2026).

#### Scenario: Việc gộp còn lý do khác

- **WHEN** việc về một tin của T1 mang cả lý do "hạn chế do máy" lẫn lý do "máy giữ", người đăng sửa và máy cho bản
  sửa qua ở mức hạn chế
- **THEN** việc vẫn mở với lý do "hạn chế do máy", nằm ở hàng 3, và hạn xử không đổi

### Requirement: Rút tin chờ duyệt về nháp thì việc bị huỷ

Người đăng rút một tin đang chờ duyệt về nháp thì việc đang mở về tin đó SHALL bị huỷ; gửi lại thì máy chấm lại và
sinh việc mới nếu còn giữ (chốt 15/10/2026).

#### Scenario: Rút tin bị giữ về nháp

- **WHEN** tin đang chờ duyệt có việc hàng 0 và người đăng rút tin về nháp
- **THEN** việc bị huỷ và không còn trong hàng chờ của ai

### Requirement: Quá hạn chỉ chuyển cấp, không bao giờ tự mở tin

Việc hàng 0, hàng 3 và hàng 4 quá hạn xử SHALL được chuyển sang hàng của master; hệ thống kiểm mỗi phút. Tin
MUST giữ nguyên trạng thái và mức hiển thị: không lượt chạy nền nào được đưa một tin lên bảng hay gỡ một lý
do hạn chế thay cho người.

#### Scenario: Việc máy giữ quá hạn

- **WHEN** việc hàng 0 về một tin quá 24 giờ chưa ai quyết
- **THEN** việc nằm trong hàng của master và tin vẫn ở trạng thái chờ duyệt

#### Scenario: Việc hạn chế do máy quá hạn

- **WHEN** việc hàng 3 quá 72 giờ chưa ai quyết
- **THEN** việc nằm trong hàng của master và tin vẫn hiển thị hạn chế với lý do "máy"

#### Scenario: Việc mẫu đã gộp lý do khác

- **WHEN** việc hàng 5 đã gộp thêm lý do máy giữ và quá hạn xử
- **THEN** việc được chuyển sang hàng của master, không bị huỷ, và tin vẫn ở trạng thái chờ duyệt

#### Scenario: Người xử ban đầu không còn thấy việc đã chuyển

- **WHEN** việc hàng 0 trong hàng của staff A quá hạn và được chuyển sang hàng của master
- **THEN** việc không còn trong hàng chờ của A, và A nhận việc đó bằng mã việc thì nhận HTTP 404 `NOT_FOUND` (chốt
  15/10/2026)

### Requirement: Hàng của master có nhắc hạn

Việc nằm trong hàng của master quá 72 giờ (giá trị khởi đầu) SHALL hiện là quá hạn trên bảng tồn và master
được nhắc; sau đó master được nhắc lại mỗi ngày tới khi việc được xử. Hệ thống kiểm mỗi giờ. Nhắc MUST NOT
đổi gì trên tin.

#### Scenario: Việc của master quá 72 giờ

- **WHEN** một việc nằm trong hàng của master được 73 giờ
- **THEN** bảng tồn hiện việc đó là quá hạn, master được nhắc, và tin vẫn ở trạng thái chờ duyệt

#### Scenario: Nhắc lại mỗi ngày

- **WHEN** một ngày nữa trôi qua mà việc vẫn chưa được xử
- **THEN** master được nhắc thêm một lần và tin vẫn không đổi

### Requirement: Cảnh báo khi nhiều việc sắp chạm hạn

Hệ thống SHALL phát một cảnh báo tới master khi từ một nửa số việc đang mở trên toàn hệ thống trở lên sẽ chạm hạn
xử trong 24 giờ tới; hệ thống kiểm mỗi giờ. Cảnh báo lặp lại khi master chưa đọc SHALL cập nhật dòng cũ thay vì
thêm dòng (chốt 15/10/2026).

#### Scenario: Một nửa số việc sắp chạm hạn

- **WHEN** mọi việc đang mở nằm trong một hàng, có 10 việc và 5 việc sẽ chạm hạn trong 24 giờ tới
- **THEN** một cảnh báo được phát

#### Scenario: Chưa tới một nửa

- **WHEN** mọi việc đang mở nằm trong một hàng, có 10 việc và 4 việc sẽ chạm hạn trong 24 giờ tới
- **THEN** không có cảnh báo nào được phát

#### Scenario: Cảnh báo hai giờ liền

- **WHEN** điều kiện cảnh báo đúng ở hai lượt kiểm liền nhau và master chưa đọc cảnh báo đầu
- **THEN** hộp thư của master vẫn chỉ có một dòng cảnh báo chưa đọc

### Requirement: Việc của tin trong nhóm theo tư cách thành viên hiện tại

Việc máy giữ về tin trong nhóm SHALL bị huỷ hay sinh lại theo tư cách thành viên hiện tại của người đăng: lượt rời
nhóm được xử lại sau khi người đó đã vào lại MUST NOT huỷ việc, và lượt vào lại xử lại khi người đó đã rời hay bị
cấm MUST NOT sinh việc (chốt 15/10/2026).

#### Scenario: Lượt rời được xử lại sau khi vào lại

- **WHEN** thành viên có tin chờ duyệt trong nhóm rời rồi vào lại nhóm, và hệ thống xử lại lượt rời
- **THEN** tin vẫn có đúng một việc hàng 0 đang mở trong hàng của điều hành nhóm

### Requirement: Người bị khoá không nhận việc của nhóm

Điều hành viên hay chủ nhóm có tài khoản bị khoá MUST NOT được tính là người xử việc của nhóm, và nhóm đang thiếu
chủ không có chủ để chuyển việc tới: việc đi tiếp theo chuỗi chuyển tiếp như khi không có người đó (chốt
15/10/2026).

#### Scenario: Điều hành viên duy nhất của lớp bị khoá

- **WHEN** tin của thành viên lớp 10A bị máy giữ và điều hành viên duy nhất của lớp 10A đang bị khoá
- **THEN** việc hiện trong hàng của điều hành viên cấp cả nhóm

### Requirement: Xoá tài khoản thì việc về tin của người đó bị huỷ

Khi người đăng xoá tài khoản, mọi việc đang mở về tin của người đó SHALL bị huỷ: tin không còn hiện với ai, và master
MUST NOT bị nhắc vì việc đó (chốt 15/10/2026).

#### Scenario: Người đăng xoá tài khoản khi tin đang chờ duyệt

- **WHEN** tin sàn của một người đang chờ duyệt và người đó xoá tài khoản
- **THEN** việc về tin đó bị huỷ, và sau 73 giờ master không được nhắc vì nó

### Requirement: Việc theo trạng thái hiện tại của tin

Việc SHALL theo trạng thái hiện tại của tin: một thay đổi cũ được hệ thống xử lại sau thay đổi mới hơn của tin MUST
NOT sinh, huỷ hay đổi việc (chốt 15/10/2026).

#### Scenario: Lượt "giữ" được xử lại sau khi rút về nháp

- **WHEN** tin bị máy giữ, người đăng rút về nháp, rồi hệ thống xử lại lượt "giữ"
- **THEN** tin nháp không có việc nào đang mở

### Requirement: Tin rời nhóm hẳn hay bị cấm thì việc của nhóm bị huỷ

Tin rời nhóm hẳn (nhóm sang riêng tư, bị gỡ khỏi nhóm) SHALL không còn việc của nhóm — chỉ còn việc điều hành nhóm
chuyển lên staff. Người ngoài bị cấm khỏi nhóm thì việc máy giữ về tin của họ trong nhóm SHALL bị huỷ; gỡ cấm thì
việc được sinh lại (chốt 15/10/2026).

#### Scenario: Cấm người ngoài có tin chờ duyệt

- **WHEN** người ngoài có một tin "nhóm công khai" đang chờ duyệt bị cấm khỏi nhóm
- **THEN** việc về tin đó bị huỷ; gỡ cấm thì tin có một việc hàng 0 mới

### Requirement: Việc theo đơn vị hiện tại của người đăng

Thành viên được chuyển sang đơn vị khác thì việc đang mở về tin của họ trong nhóm SHALL đi theo đơn vị mới (chốt
15/10/2026).

#### Scenario: Chuyển từ lớp 10A sang 10B

- **WHEN** tin chờ duyệt của một thành viên lớp 10A có việc đang mở, rồi thành viên đó được chuyển sang lớp 10B
- **THEN** việc hiện trong hàng của điều hành viên lớp 10B và không còn trong hàng của điều hành viên lớp 10A

### Requirement: Nhắc master nêu đủ số việc, tối đa một lần mỗi ngày

Lượt nhắc master về việc quá hạn ở hàng master SHALL nêu tổng số việc đang quá hạn ở đó, và cảnh báo nhắc master
(nhắc hạn, việc sắp chạm hạn) MUST NOT bật lại quá một lần mỗi 24 giờ (chốt 15/10/2026).

#### Scenario: Thêm một việc quá hạn

- **WHEN** đã có 3 việc ở hàng master quá 72 giờ và một việc thứ tư vừa quá 72 giờ
- **THEN** thông báo chưa đọc của master nêu 4 việc, và không có cảnh báo mới trong 24 giờ
