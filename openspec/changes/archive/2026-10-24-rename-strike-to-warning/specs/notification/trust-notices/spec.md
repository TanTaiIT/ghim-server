## MODIFIED Requirements

### Requirement: Báo người nhận gậy

Khi một gậy được ra cho một tài khoản, chủ tài khoản SHALL được báo, có nhắc, trong nhóm "mức tin cậy và cảnh cáo" (TK 24).
Nội dung xem trong app SHALL nêu loại gậy, điều luật được trích, tin liên quan nếu có, ngày hết hạn — gậy nghiêm trọng
thì nói đang chờ master quyết — và hạn khiếu nại: 14 ngày, gậy nghiêm trọng 30 ngày (giá trị khởi đầu). Với gậy thường và gậy nặng, nội dung
SHALL nói thêm đủ bao nhiêu điểm gậy thì tạm dừng đăng tin mới (`strike.postingLockFromPoints`, đọc lúc gửi), để người
mới biết hệ quả trước khi gặp nó; gậy nghiêm trọng không có câu này vì tài khoản đã khoá. Chữ người dùng đọc gọi gậy là
"cảnh cáo", gậy nghiêm trọng là "vi phạm nghiêm trọng", điểm gậy là "điểm vi phạm" (TK 3). Thông báo SHALL
ký "Ghim" và MUST NOT nêu tên hay vai của người ra gậy. Thông báo mở được bảng uy tín của người nhận.

#### Scenario: Gậy thường khi tin bị gỡ vì vi phạm

- **WHEN** ngày 22/10/2026 staff gỡ tin "Xe đạp cũ" vì vi phạm và ra gậy thường trích điều 3 của quy định sàn
- **THEN** người đăng nhận thông báo có nhắc ký "Ghim"; nội dung trong app nêu một gậy thường, điều 3, tin "Xe đạp
  cũ", hết hạn ngày 20/01/2027 và khiếu nại được tới ngày 05/11/2026

#### Scenario: Gậy thường nói ngưỡng tạm dừng đăng tin

- **WHEN** ngưỡng tạm dừng đăng tin là 3 điểm và người dùng nhận một gậy thường
- **THEN** nội dung trong app có câu "Đủ 3 điểm vi phạm thì tạm dừng đăng tin mới." và câu nhắc gọi đó là một cảnh cáo

#### Scenario: Gậy nặng

- **WHEN** staff ra gậy nặng ngày 22/10/2026
- **THEN** nội dung trong app nêu một gậy nặng 2 điểm, hết hạn ngày 20/04/2027 (180 ngày, giá trị khởi đầu)

#### Scenario: Gậy từ báo cáo về một người

- **WHEN** staff xác nhận một báo cáo về tài khoản của Lan là đúng và ra gậy thường, không gắn tin nào
- **THEN** Lan nhận thông báo nêu điều luật, ngày hết hạn và hạn khiếu nại, không nêu tin nào và không nêu ai đã báo

#### Scenario: Gậy nghiêm trọng

- **WHEN** master ra gậy nghiêm trọng cho một tài khoản ngày 22/10/2026
- **THEN** chủ tài khoản nhận thông báo cho biết gậy nghiêm trọng đang chờ master quyết, không có ngày hết hạn, và
  khiếu nại được tới ngày 21/11/2026

#### Scenario: Không nêu người ra gậy

- **WHEN** một điều hành viên chuyển việc lên và staff Minh xác nhận, ra gậy cho người đăng
- **THEN** thông báo không chứa tên Minh, không nói staff hay master, không nhắc tới nhóm đã chuyển việc

#### Scenario: Tin đã xoá hẳn trước khi báo

- **WHEN** gậy gắn với một tin đã bị xoá hẳn trước lúc thông báo được tạo
- **THEN** người nhận vẫn được báo về gậy, nội dung nêu điều luật và các mốc, và thông báo không mở tin nào

#### Scenario: Tài khoản đã xoá

- **WHEN** gậy được ra trên bản lưu của một tài khoản đã tự xoá
- **THEN** không ai nhận thông báo về gậy đó

### Requirement: Câu nhắc không lộ chi tiết

Câu nhắc hiện trên màn hình — banner trong app và đẩy lên điện thoại — SHALL chỉ nói chuyện gì xảy ra và tiêu đề tin
liên quan nếu có. Điều luật được trích, ngày hết hạn, hạn khiếu nại và hệ quả MUST NOT nằm trong câu nhắc; chúng chỉ nằm
trong nội dung xem trong app (TK 24: màn hình khoá ai cũng đọc được). Người dùng tắt nhóm "mức tin cậy và cảnh cáo" thì thông
báo vẫn vào hộp thư, chỉ thôi nhắc.

#### Scenario: Đẩy lên điện thoại

- **WHEN** người đăng nhận gậy thường liên quan tới tin "Xe đạp cũ" và máy của họ nhận thông báo đẩy
- **THEN** câu đẩy cho biết họ nhận một gậy liên quan tới tin "Xe đạp cũ" và không chứa điều luật hay ngày hết hạn

#### Scenario: Tắt nhóm "mức tin cậy và gậy"

- **WHEN** người dùng đã tắt nhóm "mức tin cậy và cảnh cáo" và nhận một gậy
- **THEN** thông báo vào hộp thư, không hiện banner và không đẩy lên điện thoại
