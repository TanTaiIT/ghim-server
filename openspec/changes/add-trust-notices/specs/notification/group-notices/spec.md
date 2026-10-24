## ADDED Requirements

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
