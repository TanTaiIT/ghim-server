# notification/group-notices Specification

## Purpose

Báo từng chuyện xảy ra trong nhóm cho đúng người — người được giao việc, người trong cuộc, quản trị nhóm, cả nhóm —
mà không làm lộ điều riêng của ai (TK 9, TK 10, TK 24).

## Requirements

### Requirement: Báo người được giao việc trong nhóm

Người được giao làm chủ nhóm, người được nhờ nhận chuyển chủ, người được mời vào nhóm, và người có tên trong danh
sách lớp lúc danh sách được nạp SHALL được báo, thuộc nhóm "nhóm của bạn", có nhắc.

#### Scenario: Được mời

- **WHEN** điều hành viên mời một người vào nhóm
- **THEN** người được mời nhận một thông báo có nhắc, cho biết lời mời còn hạn tới ngày nào

#### Scenario: Được nhờ nhận chuyển chủ

- **WHEN** chủ nhóm chuyển chủ cho Minh
- **THEN** Minh nhận một thông báo có nhắc về lời chuyển chủ

#### Scenario: Có tên trong danh sách lớp

- **WHEN** chủ nhóm nạp danh sách lớp có email của An, người đã có tài khoản
- **THEN** An nhận một thông báo có nhắc mời vào nhóm

#### Scenario: Email chưa có tài khoản

- **WHEN** danh sách lớp có một email chưa thuộc tài khoản nào
- **THEN** không ai nhận thông báo về email đó

### Requirement: Báo kết quả cho người trong cuộc

Người xin SHALL được báo khi đơn được duyệt, bị từ chối (kèm ngày được gửi lại), bị huỷ vì nhóm mở cửa hay vì nhóm
đóng, và khi đơn hết hạn (không nhắc). Người bị gỡ, bị cấm, được bổ nhiệm, bị bãi nhiệm SHALL được báo có nhắc;
người được gỡ cấm, được xếp đơn vị, được đổi phạm vi điều hành SHALL được báo không nhắc. Người gửi lời chuyển chủ
SHALL được báo khi lời được nhận hay bị từ chối, và khi lời hết hạn (không nhắc). Chủ cũ SHALL được báo khi master
giao chủ nhóm cho người khác.

#### Scenario: Đơn bị từ chối

- **WHEN** điều hành viên từ chối đơn của một người
- **THEN** người đó nhận thông báo có nhắc, cho biết ngày được gửi lại đơn

#### Scenario: Bị cấm

- **WHEN** điều hành viên cấm một thành viên
- **THEN** người đó nhận thông báo có nhắc rằng mình không còn là thành viên và không vào lại được

#### Scenario: Đơn hết hạn

- **WHEN** đơn của một người tự huỷ sau 21 ngày
- **THEN** người đó nhận thông báo trong hộp thư, không nhắc

#### Scenario: Lời chuyển chủ được nhận

- **WHEN** Minh nhận lời chuyển chủ
- **THEN** chủ cũ nhận thông báo có nhắc rằng Minh đã nhận làm chủ

### Requirement: Báo quản trị nhóm

Chủ nhóm và điều hành viên cả nhóm SHALL được báo khi có đơn xin vào mới, theo luật gộp. Mọi điều hành viên SHALL
được báo có nhắc khi nhóm sang thiếu chủ, và không nhắc khi chủ cũ trở lại hay khi nhóm có chủ mới.

#### Scenario: Đơn mới

- **WHEN** một người gửi đơn vào nhóm có điều hành viên cả nhóm và điều hành viên lớp 12A1
- **THEN** chủ nhóm và điều hành viên cả nhóm được báo, điều hành viên lớp 12A1 thì không

#### Scenario: Nhóm thiếu chủ

- **WHEN** tài khoản chủ nhóm bị khoá và nhóm sang thiếu chủ
- **THEN** mọi điều hành viên nhận thông báo có nhắc rằng nhóm tạm thời chưa có chủ

### Requirement: Báo cả nhóm

Mọi thành viên SHALL được báo có nhắc khi nhóm tạm khoá, mở khoá, đóng, hay chuyển từ riêng tư sang công khai. Khi
nhóm đóng, người có đơn đang chờ và người có lời mời còn hạn SHALL cũng được báo.

#### Scenario: Nhóm bị khoá

- **WHEN** master khoá một nhóm kèm lý do
- **THEN** mọi thành viên nhận thông báo có nhắc rằng nhóm đang tạm khoá; chỉ thông báo của chủ nhóm và điều hành
  viên chứa lý do khoá

#### Scenario: Nhóm đóng

- **WHEN** chủ nhóm đóng nhóm trong lúc có một đơn đang chờ và một lời mời còn hạn
- **THEN** mọi thành viên trừ chủ nhóm, người xin và người được mời đều được báo nhóm đã đóng

#### Scenario: Riêng tư thành công khai

- **WHEN** chủ nhóm đổi nhóm riêng tư sang công khai
- **THEN** mọi thành viên trừ chủ nhóm được báo nhóm đã thành công khai

### Requirement: Không báo người tự làm

Người làm một việc MUST NOT nhận thông báo về chính việc đó.

#### Scenario: Chủ nhóm đóng nhóm

- **WHEN** chủ nhóm đóng nhóm của mình
- **THEN** chủ nhóm không nhận thông báo nhóm đã đóng

#### Scenario: Điều hành viên duyệt đơn

- **WHEN** điều hành viên duyệt một đơn
- **THEN** điều hành viên đó không nhận thông báo nào về đơn vừa duyệt

### Requirement: Câu nhắc không lộ điều riêng

Thông báo về quyết định của nhóm — từ chối đơn, gỡ, cấm — MUST ký "Quản trị nhóm" và không nêu tên người quản trị
nào. Câu nhắc MUST NOT chứa lý do khoá hay lý do cấm. Thông báo nhóm thiếu chủ MUST NOT nói chủ nhóm bị khoá.

#### Scenario: Bị từ chối

- **WHEN** điều hành viên Bình từ chối đơn của An
- **THEN** thông báo An nhận không có tên Bình

#### Scenario: Nhóm bị khoá có lý do

- **WHEN** master khoá nhóm với lý do "Lừa đảo"
- **THEN** câu nhắc gửi cho chủ nhóm không chứa "Lừa đảo"; lý do chỉ nằm trong nội dung thông báo xem trong app

### Requirement: Những chuyện không báo

Có người bấm tham gia, tự rời nhóm hay nhận lời mời; lời mời bị thu hồi hay hết hạn; đổi mã nhóm, kiểu bảng tin hay
"nhận tin người ngoài" MUST NOT tạo thông báo nào.

#### Scenario: Thành viên tự rời

- **WHEN** một thành viên tự rời nhóm
- **THEN** không ai nhận thông báo về việc đó

#### Scenario: Đổi mã nhóm

- **WHEN** chủ nhóm đổi mã nhóm
- **THEN** không ai nhận thông báo về việc đó

### Requirement: Thông báo theo trạng thái hiện tại của nhóm

Thông báo về trạng thái của nhóm và tư cách của một người — chủ mới, thiếu chủ, chủ trở lại, tạm khoá, mở khoá, bị gỡ,
bị cấm, được gỡ cấm — SHALL chỉ được viết khi điều nó nói còn đúng lúc viết. Một thay đổi cũ được hệ thống xử lại sau
thay đổi mới hơn MUST NOT sinh thông báo trái với trạng thái hiện tại (chốt 16/10/2026).

#### Scenario: Lượt khoá được xử lại sau khi nhóm đã mở khoá

- **WHEN** master khoá rồi mở khoá một nhóm, và hệ thống xử lại lượt khoá
- **THEN** không thành viên nào nhận thêm thông báo "đang tạm khoá"

#### Scenario: Được gỡ cấm trước khi lượt cấm được báo

- **WHEN** một thành viên bị cấm rồi được gỡ cấm trước khi hệ thống báo lượt cấm
- **THEN** người đó nhận thông báo rằng mình không còn là thành viên, không có câu "không vào lại nhóm này được"

#### Scenario: Chủ nhóm đổi hai lần

- **WHEN** chủ nhóm chuyển cho An, An chuyển tiếp cho Bình, rồi hệ thống xử lại lượt chuyển cho An
- **THEN** không ai nhận thêm thông báo rằng An là chủ nhóm mới

### Requirement: Báo quản trị nhóm có tin chờ duyệt

Khi tin trong nhóm bị máy giữ và việc vào hàng của quản trị nhóm (`review/queues`, "Việc vào hàng của ai"), những người
đang xử được việc đó SHALL được báo, có nhắc, theo luật gộp: chưa đọc thì cập nhật dòng cũ với số tin đang chờ trong
phạm vi của người nhận, nhắc lại tối đa mỗi 30 phút mỗi nhóm (giá trị khởi đầu). Thông báo mở được hàng chờ của nhóm.

#### Scenario: Tin của lớp 10A bị giữ

- **WHEN** tin của một thành viên lớp 10A bị máy giữ, danh mục đặt "tin nhóm bị giữ do nhóm duyệt", lớp 10A có điều
  hành viên xử được, và nhóm có điều hành viên cấp cả nhóm
- **THEN** điều hành viên lớp 10A nhận thông báo có nhắc rằng nhóm có tin chờ duyệt; điều hành viên lớp 10B, điều hành
  viên cấp cả nhóm và chủ nhóm không nhận

#### Scenario: Lớp không còn ai xử được

- **WHEN** tin của một thành viên lớp 10A bị máy giữ và điều hành viên duy nhất của lớp 10A đang bị khoá
- **THEN** điều hành viên cấp cả nhóm nhận thông báo, điều hành viên đang bị khoá thì không

#### Scenario: Ba tin trong mười phút

- **WHEN** ba tin trong phạm vi của một điều hành viên bị máy giữ trong 10 phút và điều hành viên chưa đọc thông báo
  nào về tin chờ duyệt
- **THEN** hộp thư của điều hành viên có đúng một thông báo cho biết 3 tin đang chờ duyệt, và chỉ lần đầu có nhắc

#### Scenario: Việc đã xử trước khi đọc

- **WHEN** thông báo gộp chưa đọc nói 3 tin đang chờ, hai việc đã được xử, rồi có thêm một tin bị giữ
- **THEN** thông báo gộp được cập nhật thành 2 tin đang chờ

### Requirement: Không báo quản trị nhóm việc không phải của mình

Việc vào hàng staff — danh mục đặt "tin nhóm bị giữ do sàn duyệt" — MUST NOT tạo thông báo cho quản trị nhóm. Quản trị
nhóm MUST NOT được báo về tin của chính mình. Thông báo tin chờ duyệt MUST NOT nêu lý do máy giữ hay tên người đăng.

#### Scenario: Danh mục do sàn duyệt

- **WHEN** tin trong nhóm thuộc danh mục đặt "tin nhóm bị giữ do sàn duyệt" bị máy giữ
- **THEN** không quản trị nào của nhóm nhận thông báo về tin đó

#### Scenario: Tin của chính điều hành viên

- **WHEN** tin của điều hành viên lớp 10A, đăng trong lớp 10A, bị máy giữ
- **THEN** điều hành viên đó không nhận thông báo về tin của chính mình

#### Scenario: Không nêu lý do máy giữ

- **WHEN** tin của Lan trong lớp 10A bị máy giữ vì ảnh trùng với tin của tài khoản khác
- **THEN** thông báo của điều hành viên lớp 10A không nêu ảnh trùng, không nêu luật máy đã trúng và không nêu tên Lan
