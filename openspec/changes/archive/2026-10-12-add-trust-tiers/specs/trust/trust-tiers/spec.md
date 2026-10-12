## Purpose

Xếp mỗi người dùng vào một trong bốn mức tin cậy T0–T3, tính lại từ dữ kiện chứ không cộng trừ, để mức lên
bằng thời gian và lịch sử sạch, không mua nhanh được (TK 20).

## ADDED Requirements

### Requirement: Tài khoản mới ở mức T0

Tài khoản vừa xác nhận email — bằng mã gửi về email hay qua đăng nhập Google — SHALL ở mức T0 cho tới khi đủ
điều kiện lên mức trên.

#### Scenario: Xác nhận email bằng mã

- **WHEN** anh Minh đăng ký bằng email và nhập đúng mã xác nhận ở ngày 1
- **THEN** tài khoản của anh ở mức T0

#### Scenario: Đăng ký bằng Google

- **WHEN** một người tạo tài khoản bằng Google
- **THEN** tài khoản ở mức T0 ngay khi được tạo

### Requirement: Lên mức theo tuổi tài khoản và tin sạch

Mỗi mức trên T0 MUST đủ cả tuổi tài khoản lẫn số tin sạch được tính: T1 từ 7 ngày tuổi và 1 tin sạch; T2 từ
30 ngày và 5 tin sạch; T3 từ 90 ngày và 20 tin sạch (giá trị khởi đầu). Tài khoản SHALL ở mức cao nhất mà nó
đủ mọi điều kiện.

#### Scenario: Đủ cả tuổi lẫn tin sạch cho T1

- **WHEN** ở ngày 8 tài khoản của anh Minh đủ 7 ngày tuổi và có một tin đã hiện đủ 7 ngày
- **THEN** tài khoản lên mức T1

#### Scenario: Đủ tuổi nhưng chưa có tin sạch

- **WHEN** tài khoản 20 ngày tuổi chưa có tin sạch nào
- **THEN** tài khoản vẫn ở mức T0

#### Scenario: Có tin sạch nhưng chưa đủ tuổi

- **WHEN** tài khoản 5 ngày tuổi có 2 tin sạch
- **THEN** tài khoản vẫn ở mức T0

#### Scenario: Lên T2

- **WHEN** ở ngày 30 tài khoản của anh Minh có 5 tin sạch được tính và chưa từng nhận gậy
- **THEN** tài khoản lên mức T2

#### Scenario: Đủ tuổi T3 nhưng thiếu tin sạch

- **WHEN** tài khoản 100 ngày tuổi, chưa từng nhận gậy, có 19 tin sạch được tính
- **THEN** tài khoản ở mức T2

#### Scenario: Lên T3

- **WHEN** tài khoản 90 ngày tuổi, chưa từng nhận gậy, có 20 tin sạch được tính
- **THEN** tài khoản lên mức T3

### Requirement: Tin sạch nhờ đủ ngày hiển thị

Một tin SHALL thành tin sạch của người đăng khi đã ở trạng thái đang hiển thị ít nhất 7 ngày, ở mức đầy đủ hay
hạn chế đều được, trừ khi tin bị gỡ vì vi phạm hay bị báo cáo đúng. Mỗi tin MUST NOT được tính là tin sạch quá
một lần.

#### Scenario: Tin hiển thị hạn chế đủ 7 ngày

- **WHEN** tin đầu tiên của anh Minh hiển thị hạn chế trên sàn chung liên tục 7 ngày
- **THEN** tin đó thành tin sạch

#### Scenario: Chưa đủ 7 ngày

- **WHEN** một tin hiển thị 6 ngày rồi được người đăng đánh dấu đã bán, không ai nhắn hỏi mua
- **THEN** tin đó không là tin sạch

#### Scenario: Tin chờ duyệt lâu

- **WHEN** một tin nằm ở trạng thái chờ duyệt 8 ngày mà chưa từng hiển thị
- **THEN** tin đó không là tin sạch

#### Scenario: Tin được gia hạn

- **WHEN** một tin đã thành tin sạch, hết hạn, được gia hạn và hiển thị thêm 7 ngày
- **THEN** tin đó vẫn chỉ được tính là một tin sạch

### Requirement: Tin đã bán thành tin sạch

Tin được người đăng đánh dấu đã bán SHALL thành tin sạch khi trước đó đã hiển thị ít nhất 2 ngày (giá trị khởi
đầu) và có ít nhất một người khác nhắn hỏi mua về tin đó. Điều kiện chặt hơn lối 7 ngày vì người đăng tự bấm
được nút đã bán.

#### Scenario: Bán sau 3 ngày, có người hỏi mua

- **WHEN** một tin hiển thị 3 ngày, có một người nhắn hỏi mua, rồi được người đăng đánh dấu đã bán
- **THEN** tin đó thành tin sạch

#### Scenario: Bán quá sớm

- **WHEN** một tin hiển thị 1 ngày, có người nhắn hỏi mua, rồi được đánh dấu đã bán
- **THEN** tin đó không là tin sạch

#### Scenario: Bán mà không ai hỏi mua

- **WHEN** một tin hiển thị 5 ngày, không ai nhắn hỏi mua, rồi được đánh dấu đã bán
- **THEN** tin đó không là tin sạch

#### Scenario: Đã sạch rồi mới bán

- **WHEN** một tin đã thành tin sạch nhờ hiển thị 10 ngày, sau đó được đánh dấu đã bán và có người đã hỏi mua
- **THEN** tin đó vẫn chỉ được tính là một tin sạch

### Requirement: Tin bị gỡ vì vi phạm hoặc bị báo cáo đúng không là tin sạch

Tin bị gỡ vì vi phạm, hoặc có một báo cáo được người xử xác nhận là đúng, MUST NOT là tin sạch, kể cả khi đã
đủ ngày hiển thị. Tin đã được tính là sạch mà sau đó rơi vào một trong hai trường hợp này SHALL thôi được tính.

#### Scenario: Tin đủ 7 ngày rồi bị gỡ vì vi phạm

- **WHEN** một tin đã hiển thị 10 ngày và được tính là tin sạch thì bị người duyệt gỡ vì vi phạm
- **THEN** tin đó thôi được tính là tin sạch

#### Scenario: Báo cáo đúng

- **WHEN** một tin đã hiển thị 8 ngày có một báo cáo được người xử xác nhận là đúng
- **THEN** tin đó không là tin sạch

#### Scenario: Báo cáo bị bác

- **WHEN** một tin đã hiển thị 8 ngày có một báo cáo bị người xử bác
- **THEN** tin đó vẫn là tin sạch

### Requirement: Tin bị gỡ vì sai sót không bị trừ

Chỉ gỡ vì vi phạm SHALL làm tin mất tư cách tin sạch. Tin bị gỡ vì sai sót MUST NOT bị trừ: tin đã được tính là
sạch vẫn được tính. Tin chưa sạch thì chưa được cộng trong lúc bị gỡ; khi người đăng sửa xong và tin hiện lại đủ
7 ngày, tin SHALL thành tin sạch như thường (TK 20).

#### Scenario: Tin đã sạch rồi bị gỡ vì sai sót

- **WHEN** một tin đã hiển thị 10 ngày và được tính là tin sạch thì bị người duyệt gỡ vì sai sót
- **THEN** tin đó vẫn được tính là tin sạch

#### Scenario: Tin chưa sạch nằm ở trạng thái bị gỡ

- **WHEN** một tin hiển thị 3 ngày thì bị gỡ vì sai sót và nằm ở trạng thái bị gỡ 10 ngày
- **THEN** tin đó chưa là tin sạch

#### Scenario: Sửa xong và hiện lại đủ 7 ngày

- **WHEN** một tin hiển thị 3 ngày thì bị gỡ vì sai sót, người đăng sửa, tin được cho qua và hiển thị thêm 7
  ngày
- **THEN** tin đó thành tin sạch

### Requirement: Tối đa 3 tin sạch trong 7 ngày cuốn chiếu

Trong mọi khoảng 7 ngày liên tiếp, xét theo thời điểm tin thành tin sạch, SHALL có tối đa 3 tin sạch được tính
vào mức (giá trị khởi đầu) — để mức lên bằng thời gian, không mua nhanh được bằng cách đăng dồn.

#### Scenario: Năm tin cùng thành sạch một ngày

- **WHEN** năm tin của cùng một người thành tin sạch trong cùng một ngày
- **THEN** ngay sau đó chỉ ba tin được tính vào mức

#### Scenario: Tin sạch thứ tư sau khi khoảng cũ trôi qua

- **WHEN** ba tin thành tin sạch vào ngày 10, 11, 12 và tin thứ tư thành tin sạch vào ngày 18
- **THEN** tin thứ tư được tính vào mức

### Requirement: Mức được tính lại từ toàn bộ dữ kiện

Mỗi lần tính, hệ thống SHALL tính mức lại từ đầu dựa trên toàn bộ dữ kiện của tài khoản và phiên bản bảng con
số đang hiệu lực, không cộng trừ từ mức cũ. Mức lên hay xuống đều chỉ theo kết quả tính lại; MUST NOT có thao
tác nào khác — kể cả máy duyệt giữ tin — đặt hay hạ mức trực tiếp.

#### Scenario: Tin sạch duy nhất thôi được tính

- **WHEN** tài khoản 40 ngày tuổi ở mức T1 nhờ đúng một tin sạch, và tin đó bị gỡ vì vi phạm
- **THEN** mức được tính lại về T0

#### Scenario: Máy giữ tin không hạ mức

- **WHEN** máy duyệt giữ cho người ba tin của một người đang ở mức T2 trong 7 ngày
- **THEN** người đó vẫn ở mức T2

#### Scenario: Bảng con số đổi ngưỡng

- **WHEN** master phát hành phiên bản bảng con số mới nâng tuổi tối thiểu của T1 lên 14 ngày, và tài khoản 10
  ngày tuổi có 1 tin sạch được tính lại
- **THEN** lần tính lại đó dùng phiên bản mới và tài khoản ở mức T0

### Requirement: Tính lại hai lần ra cùng một kết quả

Mức SHALL chỉ phụ thuộc dữ kiện của tài khoản và phiên bản bảng con số: tính lại hai lần trên cùng dữ kiện và
cùng phiên bản MUST ra cùng mức. Mỗi kết quả tính SHALL ghi lại phiên bản bảng con số đã dùng.

#### Scenario: Tính lại khi không có gì mới

- **WHEN** mức của một tài khoản được tính lại hai lần liên tiếp mà dữ kiện và phiên bản không đổi
- **THEN** hai lần ra cùng mức và không có lần lên hay xuống mức nào được ghi nhận

#### Scenario: Tính lại khi có tin sạch bị giới hạn

- **WHEN** tài khoản có năm tin cùng thành sạch một ngày được tính lại hai lần ngay trong ngày đó
- **THEN** cả hai lần đều tính đúng ba tin sạch và ra cùng mức

#### Scenario: Ghi phiên bản đã dùng

- **WHEN** một lần tính lại cho ra mức mới
- **THEN** kết quả đó ghi kèm phiên bản bảng con số đã dùng

### Requirement: Khi nào mức được tính lại

Hệ thống SHALL tính lại mức ngay khi tài khoản có một tin sạch mới do đánh dấu đã bán, hoặc một tin thôi được
tính là sạch. Mỗi ngày một lần, hệ thống SHALL tính lại mức cho mọi tài khoản có dữ kiện đổi theo thời gian, như
tuổi tài khoản chạm mốc của một mức hay tin vừa đủ ngày hiển thị.

#### Scenario: Tin vừa đủ 7 ngày hiển thị

- **WHEN** tin đầu tiên của anh Minh đủ 7 ngày hiển thị trong ngày 8
- **THEN** lượt tính lại hằng ngày đưa tài khoản lên T1, không cần anh làm gì

#### Scenario: Tin đã bán đủ điều kiện

- **WHEN** một tin đủ điều kiện tin sạch được đánh dấu đã bán
- **THEN** mức được tính lại ngay, không chờ lượt tính lại hằng ngày

#### Scenario: Tuổi tài khoản chạm mốc

- **WHEN** tài khoản có một tin sạch nhờ đã bán từ khi mới 6 ngày tuổi, rồi đủ 7 ngày tuổi
- **THEN** lượt tính lại hằng ngày ngay sau mốc đó đưa tài khoản lên T1

### Requirement: Tin sạch vượt giới hạn được dời, không bỏ

Tin sạch vượt giới hạn 3 tin trong 7 ngày SHALL vẫn là tin sạch và được tính vào mức từ lúc khoảng 7 ngày có chỗ
— MUST NOT bị bỏ (chốt 12/10/2026).

#### Scenario: Tin thứ tư cùng ngày

- **WHEN** bốn tin của cùng một người thành tin sạch trong ngày 10
- **THEN** ba tin được tính ngay, tin thứ tư được tính vào mức từ ngày 17

### Requirement: Thời gian hiển thị của tin sạch là cộng dồn lúc được thấy

Thời gian hiển thị để thành tin sạch SHALL cộng dồn mọi khoảng tin ở trạng thái đang hiển thị mà không tạm ẩn; thời
gian tạm ẩn MUST NOT được tính, kể cả khi ngày hiển thị của tin vẫn trôi (chốt 12/10/2026).

#### Scenario: Hiện, tạm ẩn, hiện lại

- **WHEN** một tin hiển thị 4 ngày, tạm ẩn 3 ngày vì tài khoản bị khoá, rồi hiện lại thêm 3 ngày
- **THEN** tin thành tin sạch khi hiện lại đủ 3 ngày, không phải ngay lúc mở khoá

### Requirement: Khôi phục hay khiếu nại thắng trả lại tư cách tin sạch

Tin bị gỡ hay bị từ chối vì vi phạm rồi được khôi phục, hoặc khiếu nại thắng, SHALL có lại tư cách tin sạch với
mốc cũ; chỉ tin đang bị gỡ hay bị từ chối vì vi phạm mới không là tin sạch (chốt 12/10/2026).

#### Scenario: Gỡ vì vi phạm rồi khiếu nại thắng

- **WHEN** một tin đã sạch từ ngày 10 bị gỡ vì vi phạm ngày 15, rồi khiếu nại thắng ngày 18
- **THEN** từ ngày 18 tin lại được tính là tin sạch với mốc ngày 10

### Requirement: Tin sạch còn được tính sau khi tin bị xoá

Tin đã thành tin sạch SHALL vẫn được tính sau khi người đăng xoá tin hay tin bị xoá hẳn theo hạn lưu; hệ thống giữ
dữ kiện "tin thành sạch lúc nào", không giữ nội dung tin (chốt 12/10/2026).

#### Scenario: Xoá tin đã sạch

- **WHEN** người dùng ở mức T1 nhờ đúng một tin sạch xoá tin đó
- **THEN** người đó vẫn ở mức T1

### Requirement: Tuổi tài khoản tính từ lúc tạo

Tuổi tài khoản SHALL tính từ lúc tạo tài khoản, không phải từ lúc xác nhận email (chốt 12/10/2026).

#### Scenario: Xác nhận email muộn

- **WHEN** một tài khoản tạo ngày 1, xác nhận email ngày 5, có một tin sạch ngày 12
- **THEN** ngày 12 tài khoản đủ 7 ngày tuổi cho T1

### Requirement: Bảng con số mới áp ở lần tính kế tiếp

Khi master phát hành phiên bản bảng con số mới, lần tính kế tiếp của mỗi tài khoản — do có chuyện mới hay lượt hằng
ngày — SHALL dùng phiên bản mới; lượt hằng ngày kế tiếp SHALL tính lại mọi tài khoản còn mang kết quả theo phiên bản
cũ (chốt 12/10/2026).

#### Scenario: Không có chuyện gì mới

- **WHEN** master nâng tuổi tối thiểu của T1 lên 14 ngày và một tài khoản 10 ngày tuổi ở mức T1 không có chuyện gì
  mới
- **THEN** sau lượt tính lại hằng ngày kế tiếp tài khoản ở mức T0, ghi kèm phiên bản mới
