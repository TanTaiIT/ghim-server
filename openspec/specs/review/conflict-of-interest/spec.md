# review/conflict-of-interest Specification

## Purpose

Bảo đảm không ai, trừ master, xử việc của chính mình — kể cả qua tài khoản dùng chung thiết bị — và mọi việc
cần hai người luôn do hai người khác nhau làm (TK 16, nguyên tắc 4 và 5, cam kết 1 và 2).

## Requirements

### Requirement: Không ai, trừ master, xử việc của chính mình

Việc về một tin hay về một người MUST NOT hiện trong hàng chờ, và MUST NOT nhận hay quyết được, bởi người đăng
tin đó, bởi chính người đó, hay bởi tài khoản dùng chung thiết bị với họ. Luật này SHALL áp cho mọi vai, trừ
master. Hai tài khoản dùng chung thiết bị khi cả hai từng đăng tin hoặc đăng nhập từ cùng một máy trong 180 ngày gần
nhất — toàn bộ dữ liệu thiết bị hệ thống còn giữ (chốt 15/10/2026; dấu đăng nhập thêm 24/10/2026).

#### Scenario: Staff đăng tin trong danh mục của mình

- **WHEN** staff được giao Điện thoại đăng một tin Điện thoại và tin bị máy giữ
- **THEN** việc về tin đó không hiện trong hàng chờ của chính staff ấy

#### Scenario: Nhận việc của mình bằng mã việc

- **WHEN** staff nhận việc về tin của chính mình bằng mã việc
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tài khoản phụ trên cùng máy

- **WHEN** staff S và tài khoản B đều đã đăng tin từ cùng một máy, và tin của B bị máy giữ
- **THEN** việc về tin của B không hiện trong hàng chờ của S

#### Scenario: Tài khoản phụ chỉ đăng nhập trên máy của staff

- **WHEN** staff S đã đăng nhập app từ một máy mà chưa từng đăng tin, tài khoản B đăng tin từ cùng máy đó và tin bị
  máy giữ
- **THEN** việc về tin của B không hiện trong hàng chờ của S, và S nhận việc đó bằng mã việc thì nhận HTTP 404
  `NOT_FOUND`

#### Scenario: Điều hành viên đăng tin trong nhóm mình

- **WHEN** điều hành viên đăng tin trong nhóm mình phụ trách và tin bị máy giữ
- **THEN** việc về tin đó không hiện trong hàng chờ của chính điều hành viên ấy

#### Scenario: Khôi phục tin của chính mình

- **WHEN** staff khôi phục một tin sàn đang bị gỡ do chính mình đăng
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn bị gỡ

### Requirement: Chuỗi chuyển tiếp trong nhóm

Việc về tin trong nhóm nằm ở hàng của điều hành nhóm, bị loại khỏi hàng của một người vì luật không xử việc
của mình, SHALL đi cho người kế tiếp xử được, theo thứ tự: điều hành viên khác cùng phạm vi, điều hành viên
cấp cả nhóm, chủ nhóm, rồi staff được giao danh mục của tin.

#### Scenario: Còn điều hành viên khác cùng phạm vi

- **WHEN** điều hành viên lớp 10A đăng tin trong lớp 10A, lớp có thêm một điều hành viên khác, và tin bị
  máy giữ
- **THEN** việc hiện trong hàng của điều hành viên kia

#### Scenario: Phạm vi chỉ có một điều hành viên

- **WHEN** điều hành viên duy nhất của lớp 10A đăng tin trong lớp, nhóm có một điều hành viên cấp cả nhóm,
  và tin bị máy giữ
- **THEN** việc hiện trong hàng của điều hành viên cấp cả nhóm

#### Scenario: Không còn điều hành viên nào xử được

- **WHEN** tin bị giữ của một người mà mọi điều hành viên của nhóm đều dùng chung thiết bị với người đó
- **THEN** việc hiện trong hàng của chủ nhóm

#### Scenario: Cả nhóm không còn ai xử được

- **WHEN** chủ nhóm đăng tin trong nhóm không có điều hành viên nào và tin bị máy giữ
- **THEN** việc hiện trong hàng của staff được giao danh mục của tin

### Requirement: Chuỗi chuyển tiếp trên sàn chung

Việc về tin sàn — hay việc máy giữ về tin nhóm thuộc danh mục đặt "tin nhóm bị giữ do sàn duyệt" — bị loại
khỏi hàng của một staff vì luật không xử việc của mình SHALL đi cho staff khác cùng danh mục; danh mục không
còn staff nào xử được thì việc vào hàng master.

#### Scenario: Danh mục có staff khác

- **WHEN** staff A được giao Điện thoại đăng tin Điện thoại bị giữ và staff B cũng được giao Điện thoại
- **THEN** việc hiện trong hàng của B

#### Scenario: Tin nhóm thuộc danh mục do sàn duyệt

- **WHEN** danh mục Thú cưng đặt "tin nhóm bị giữ do sàn duyệt", staff A được giao Thú cưng đăng một tin Thú
  cưng vào một nhóm và tin bị máy giữ, staff B cũng được giao Thú cưng
- **THEN** việc hiện trong hàng của B, không hiện trong hàng của điều hành nhóm

#### Scenario: Danh mục chỉ có một staff

- **WHEN** staff duy nhất được giao Thú cưng đăng tin Thú cưng và tin bị máy giữ
- **THEN** việc hiện trong hàng của master

### Requirement: Master đứng ngoài luật xung đột

Master SHALL nhận và quyết được mọi việc, kể cả việc về tài khoản dùng chung thiết bị với tài khoản master.

#### Scenario: Tài khoản cá nhân dùng chung máy với tài khoản master

- **WHEN** tài khoản cá nhân của người làm master đăng tin từ cùng máy với tài khoản master, tin bị giữ và
  master nhận việc
- **THEN** master nhận được việc và quyết được

### Requirement: Việc cần hai người do hai người khác nhau làm

Người xử một việc chuyển từ nhóm MUST khác người đã đề nghị chuyển lên. Người hậu kiểm một tin MUST khác người
đã cho tin đó lên bảng. "Khác người" SHALL loại cả tài khoản dùng chung thiết bị với người kia, như luật không xử
việc của mình (chốt 15/10/2026).

#### Scenario: Chủ nhóm đồng thời là staff

- **WHEN** chủ nhóm, đồng thời là staff được giao danh mục của tin, gỡ một tin khỏi nhóm và chuyển lên hàng 4
- **THEN** việc hàng 4 không hiện trong hàng của chính người đó mà hiện cho staff khác cùng danh mục

#### Scenario: Người đề nghị tự nhận việc của mình

- **WHEN** người đã chuyển lên nhận chính việc hàng 4 đó bằng mã việc
- **THEN** response có HTTP 403 `FORBIDDEN` và việc vẫn chờ một người khác

#### Scenario: Hậu kiểm quyết định của chính mình

- **WHEN** tin do staff A cho đạt được đưa vào mẫu hậu kiểm
- **THEN** việc hàng 5 không hiện trong hàng của A mà hiện cho staff khác cùng danh mục

#### Scenario: Người đề nghị có tài khoản staff trên cùng máy

- **WHEN** chủ nhóm L chuyển một tin lên hàng 4, và tài khoản staff S được giao danh mục của tin đã từng đăng tin từ
  cùng máy với L
- **THEN** việc hàng 4 không hiện trong hàng của S mà hiện cho staff khác cùng danh mục
