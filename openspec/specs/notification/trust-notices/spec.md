# notification/trust-notices Specification

## Purpose

Báo người dùng những chuyện về mức tin cậy của chính họ — nhận gậy, gậy kế thừa, kết quả khiếu nại, ân xá và quyết định
về gậy nghiêm trọng, gậy hết hạn, mức tin cậy lên xuống, thời gian chờ gửi tin — để họ biết vì sao và làm gì tiếp
(TK 4 nguyên tắc 8, TK 21, TK 22, TK 24).

## Requirements

### Requirement: Báo người nhận gậy

Khi một gậy được ra, chủ tài khoản SHALL được báo có nhắc, nhóm "mức tin cậy và cảnh cáo" (TK 24), ký "Ghim",
MUST NOT nêu người ra gậy, mở được bảng uy tín. Nội dung trong app SHALL nêu loại gậy, điều luật trích, tin liên quan
nếu có, hạn gậy (nghiêm trọng: chờ master quyết) và hạn khiếu nại (14 ngày; nghiêm trọng 30). Gậy thường, nặng SHALL
nói đủ bao nhiêu điểm thì tạm dừng đăng tin (`strike.postingLockFromPoints`). Chữ người đọc: "cảnh cáo", "vi phạm
nghiêm trọng", "điểm vi phạm" (TK 3).

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

### Requirement: Báo một lần cho gậy kế thừa

Khi tài khoản đăng ký lại bằng cùng email và kế thừa gậy còn hiệu lực (TK 21), chủ tài khoản mới SHALL nhận đúng một
thông báo, có nhắc, cho biết số gậy mang theo và ngày hết hạn của từng gậy. Thông báo MUST NOT nêu tài khoản trước hay
những gì đã làm ở đó.

#### Scenario: Kế thừa hai gậy

- **WHEN** một người đăng ký lại bằng email của tài khoản đã xoá còn hai gậy thường hiệu lực
- **THEN** tài khoản mới nhận một thông báo cho biết mang theo 2 gậy còn hiệu lực kèm ngày hết hạn của từng gậy, không
  phải hai thông báo

#### Scenario: Không còn gậy hiệu lực

- **WHEN** một người đăng ký lại bằng email của tài khoản đã xoá mà mọi gậy đã hết hạn hay đã huỷ
- **THEN** tài khoản mới không nhận thông báo nào về gậy

### Requirement: Báo kết quả khiếu nại

Khi khiếu nại một gậy có kết quả, người khiếu nại SHALL được báo, có nhắc: thắng — gậy đã huỷ, tin bị gỡ vì gậy đó được
khôi phục nếu còn; thua — gậy giữ nguyên, ngày hết hạn không đổi. Gậy thường quá hạn xét 7 ngày (giá trị khởi đầu) tự thắng
thì SHALL được báo như thắng. Gậy nặng quá hạn xét chuyển master giữ nguyên gậy thì MUST NOT báo tới khi master quyết.
Khiếu nại đóng vì gậy được huỷ đường khác (ân xá, master huỷ gậy nghiêm trọng) SHALL chỉ tạo một thông báo — thông báo
huỷ gậy.

#### Scenario: Khiếu nại thắng

- **WHEN** staff khác người ra gậy chấp nhận khiếu nại về gậy gỡ tin "Xe đạp cũ"
- **THEN** người khiếu nại nhận thông báo có nhắc cho biết khiếu nại thắng, gậy đã huỷ và tin "Xe đạp cũ" được khôi
  phục

#### Scenario: Khiếu nại thua

- **WHEN** staff bác khiếu nại về một gậy thường hết hạn ngày 20/01/2027
- **THEN** người khiếu nại nhận thông báo có nhắc cho biết khiếu nại không được chấp nhận và gậy vẫn hết hạn ngày
  20/01/2027

#### Scenario: Quá hạn xét, gậy thường tự thắng

- **WHEN** khiếu nại về một gậy thường quá 7 ngày chưa ai xét
- **THEN** người khiếu nại nhận thông báo như khiếu nại thắng

#### Scenario: Quá hạn xét, gậy nặng chuyển master

- **WHEN** khiếu nại về một gậy nặng quá 7 ngày chưa ai xét và chuyển sang master
- **THEN** người khiếu nại chưa nhận thông báo nào cho tới khi master quyết

#### Scenario: Ân xá khi đang khiếu nại

- **WHEN** master ân xá một gậy đang có khiếu nại chờ xét
- **THEN** người dùng nhận đúng một thông báo — gậy đã được huỷ — không kèm thông báo riêng về khiếu nại

### Requirement: Báo khi gậy được huỷ hay đổi ngoài khiếu nại

Chủ tài khoản SHALL được báo, có nhắc, khi master ân xá một gậy, khi master quyết gậy nghiêm trọng — khoá vĩnh viễn,
hạ thành gậy nặng, hay huỷ — và khi khoá vĩnh viễn được gỡ lúc xem lại. Hạ thành gậy nặng SHALL nêu ngày hết hạn mới.
Thông báo MUST NOT nêu lý do ân xá hay nhận xét của staff.

#### Scenario: Ân xá

- **WHEN** master ân xá một gậy thường kèm lý do "nhầm điều luật"
- **THEN** chủ tài khoản nhận thông báo có nhắc cho biết gậy đã được huỷ; thông báo không chứa câu "nhầm điều luật"

#### Scenario: Hạ thành gậy nặng

- **WHEN** master hạ một gậy nghiêm trọng ra ngày 22/10/2026 thành gậy nặng
- **THEN** chủ tài khoản nhận thông báo có nhắc cho biết tài khoản đã mở khoá, gậy giờ là gậy nặng hết hạn ngày
  20/04/2027

#### Scenario: Khoá vĩnh viễn

- **WHEN** master quyết khoá vĩnh viễn một gậy nghiêm trọng
- **THEN** chủ tài khoản nhận thông báo cho biết tài khoản bị khoá vĩnh viễn

#### Scenario: Gỡ khoá vĩnh viễn khi xem lại

- **WHEN** master xem lại một khoá vĩnh viễn tới kỳ và gỡ khoá
- **THEN** chủ tài khoản nhận thông báo có nhắc cho biết khoá vĩnh viễn đã được gỡ

### Requirement: Báo gậy hết hạn

Khi một gậy hết hạn, chủ tài khoản SHALL được báo trong hộp thư, không nhắc. Hết gậy đó mà tài khoản hết bị khoá đăng tin
(dưới 3 điểm, giá trị khởi đầu) thì thông báo SHALL nói đã đăng tin lại được.

#### Scenario: Gậy hết hạn

- **WHEN** gậy thường ra ngày 22/10/2026 hết hạn ngày 20/01/2027
- **THEN** chủ tài khoản nhận thông báo không nhắc cho biết gậy đó đã hết hạn

#### Scenario: Hết hạn và được đăng tin lại

- **WHEN** tài khoản có 3 điểm bị khoá đăng tin và một gậy thường của tài khoản hết hạn, còn 2 điểm
- **THEN** thông báo cho biết gậy đã hết hạn và tài khoản đã đăng tin lại được

### Requirement: Báo khi mức tin cậy đổi

Khi mức tin cậy của một tài khoản đổi (TK 20), chủ tài khoản SHALL được báo, nêu mức mới. Lên mức SHALL vào hộp thư,
không nhắc; xuống mức SHALL có nhắc. Mức được tính lại mà không đổi MUST NOT tạo thông báo.

#### Scenario: Lên mức

- **WHEN** lượt tính lại hằng ngày đưa một tài khoản từ T1 lên T2
- **THEN** chủ tài khoản nhận thông báo không nhắc cho biết tài khoản đã lên T2

#### Scenario: Xuống mức

- **WHEN** một gậy làm trần mức của tài khoản hạ từ T2 xuống T1
- **THEN** chủ tài khoản nhận thông báo có nhắc cho biết tài khoản đang ở T1

#### Scenario: Tính lại không đổi

- **WHEN** lượt tính lại hằng ngày giữ nguyên mức T2 của một tài khoản
- **THEN** chủ tài khoản không nhận thông báo nào về mức

### Requirement: Báo khi vào thời gian chờ đăng tin

Khi tài khoản vào thời gian chờ vì dò cổng cứng (TK 13), chủ tài khoản SHALL được báo, có nhắc, bằng đúng câu và mốc mà
lượt gửi tin trong lúc chờ nhận (`listing/submission`) — tạm thời chưa gửi được tin mới, gửi lại từ thời điểm hết chờ,
24 giờ (giá trị khởi đầu) — kèm lối liên hệ hỗ trợ. Thông báo MUST NOT nêu cổng cứng, cụm từ, ảnh, giá hay số lượt đã
trúng (TK 4 nguyên tắc 8).

#### Scenario: Vào thời gian chờ

- **WHEN** lượt gửi thứ ba trong 24 giờ bị giữ vì cổng cứng lúc 15:30 ngày 22/10/2026 và tài khoản vào thời gian chờ
- **THEN** chủ tài khoản nhận thông báo có nhắc cho biết tạm thời chưa gửi được tin mới, gửi lại từ 15:30 ngày
  23/10/2026, kèm lối liên hệ hỗ trợ

#### Scenario: Không nêu tín hiệu

- **WHEN** tài khoản vào thời gian chờ sau ba lượt trúng cụm từ cấm mức chắc
- **THEN** thông báo không chứa cụm từ nào, không nói "cổng cứng" và không nói số lượt

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

### Requirement: Những chuyện về gậy và mức không báo

Người dùng tự gửi khiếu nại, điểm gậy được tính lại mà không đổi gì người dùng thấy, master xem lại một khoá vĩnh viễn
và giữ nguyên, một máy bị đánh dấu hay gỡ dấu, xác nhận email xong MUST NOT tạo thông báo nào cho người dùng đó.

#### Scenario: Tự gửi khiếu nại

- **WHEN** người dùng gửi khiếu nại về gậy của mình
- **THEN** người dùng không nhận thông báo nào về lượt gửi đó

#### Scenario: Máy bị đánh dấu

- **WHEN** máy của một người dùng bị đánh dấu vì có tài khoản bị khoá cùng máy
- **THEN** người dùng đó không nhận thông báo nào về việc máy bị đánh dấu

#### Scenario: Giữ khoá vĩnh viễn khi xem lại

- **WHEN** master xem lại một khoá vĩnh viễn tới kỳ và giữ nguyên
- **THEN** chủ tài khoản không nhận thông báo nào
