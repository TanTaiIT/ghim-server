## Purpose

Phạt người vi phạm bằng gậy có điểm và có ngày hết hạn, do một người thật ra kèm điều luật được trích, để
người bị phạt luôn biết vì sao và tới bao giờ (TK 21, cam kết 9).

## ADDED Requirements

### Requirement: Ba loại gậy, điểm và hạn

Mỗi gậy SHALL thuộc đúng một loại: thường — 1 điểm, hết hạn sau 90 ngày; nặng — 2 điểm, hết hạn sau 180
ngày (giá trị khởi đầu); nghiêm trọng — không tính điểm, không có ngày hết hạn. Mỗi gậy MUST ghi người ra,
điều trong quy định sàn được trích, loại, ngày ra và ngày hết hạn (trừ gậy nghiêm trọng).

#### Scenario: Gậy thường

- **WHEN** staff ra một gậy thường ở ngày 0
- **THEN** gậy có 1 điểm, hết hạn ở ngày 90, và ghi tên staff cùng điều đã trích

#### Scenario: Gậy nặng

- **WHEN** staff ra một gậy nặng ở ngày 0
- **THEN** gậy có 2 điểm và hết hạn ở ngày 180

#### Scenario: Gậy nghiêm trọng

- **WHEN** master ra một gậy nghiêm trọng
- **THEN** gậy không có điểm và không có ngày hết hạn

### Requirement: Gậy chỉ sinh từ quyết định vi phạm của staff hoặc master

Gậy SHALL chỉ sinh ra khi staff hoặc master quyết một việc ở mức vi phạm. Máy, điều hành nhóm, và staff xử
việc của chính mình hay của tài khoản dùng chung thiết bị với mình MUST NOT ra được gậy. Máy giữ tin, thời
gian chờ vì dò cổng cứng, từ chối hay gỡ vì sai sót, bị nhóm gỡ tin hay cấm khỏi nhóm, và báo cáo bị bác
MUST NOT tạo gậy.

#### Scenario: Máy giữ tin

- **WHEN** máy giữ một tin cho người
- **THEN** người đăng không có gậy mới và điểm gậy không đổi

#### Scenario: Dò cổng cứng

- **WHEN** một người dính cổng cứng 3 lần trong 24 giờ
- **THEN** người đó phải chờ 24 giờ mới gửi tin tiếp và không có gậy nào được tạo

#### Scenario: Từ chối vì sai sót

- **WHEN** staff từ chối một tin ở mức sai sót
- **THEN** người đăng không có gậy và điểm gậy không đổi

#### Scenario: Bị nhóm gỡ tin và cấm khỏi nhóm

- **WHEN** điều hành viên gỡ một tin khỏi nhóm rồi cấm người đăng khỏi nhóm
- **THEN** người đó không có gậy, mức tin cậy và hạn mức không đổi

#### Scenario: Báo cáo bị bác

- **WHEN** người xử bác một báo cáo về một tin
- **THEN** người đăng tin đó không có gậy

#### Scenario: Staff với tài khoản dùng chung thiết bị

- **WHEN** staff quyết ở mức vi phạm một tin của tài khoản dùng chung thiết bị với mình
- **THEN** response có HTTP 403 `FORBIDDEN` và không có gậy nào được tạo

### Requirement: Điểm gậy tự giảm khi gậy hết hạn

Điểm gậy của một người SHALL là tổng điểm các gậy thường và gậy nặng còn hiệu lực. Gậy tới ngày hết hạn SHALL
tự hết hiệu lực trong ngày đó, không cần ai thao tác. Gậy đã bị huỷ MUST NOT còn tính điểm.

#### Scenario: Hai gậy thường chồng nhau

- **WHEN** một người nhận gậy thường ở ngày 0 và gậy thường thứ hai ở ngày 40
- **THEN** điểm gậy là 1 từ ngày 0, là 2 từ ngày 40, là 1 từ ngày 90 và là 0 từ ngày 130

#### Scenario: Gậy bị huỷ

- **WHEN** một người có 2 điểm từ hai gậy thường và một trong hai gậy bị huỷ
- **THEN** điểm gậy về 1 ngay, không chờ ngày hết hạn ban đầu của gậy đó

### Requirement: Từ 3 điểm tạm khoá đăng tin

Khi điểm gậy từ 3 trở lên (giá trị khởi đầu), người đó MUST NOT gửi tin mới hay gia hạn tin, nhưng vẫn SHALL
sửa, đánh dấu đã bán và xoá được tin của mình. Tạm khoá SHALL tự gỡ khi điểm gậy về dưới 3. Lượt bị từ chối
MUST kèm thời điểm được gửi lại.

#### Scenario: Gửi tin mới khi đủ 3 điểm

- **WHEN** người đang có một gậy nặng và một gậy thường còn hiệu lực gửi một tin mới
- **THEN** response có HTTP 403 `POSTING_LOCKED` kèm ngày điểm gậy về dưới 3, và không tin nào được tạo

#### Scenario: Gia hạn khi đang tạm khoá

- **WHEN** người đó gia hạn một tin đã hết hạn
- **THEN** response có HTTP 403 `POSTING_LOCKED` và tin vẫn hết hạn

#### Scenario: Vẫn quản lý tin đang có

- **WHEN** người đó đánh dấu đã bán một tin, sửa giá một tin khác, rồi xoá một tin thứ ba
- **THEN** cả ba thao tác thành công

#### Scenario: Tạm khoá tự gỡ

- **WHEN** gậy thường của người đó hết hạn và điểm gậy về 2
- **THEN** người đó gửi được tin mới mà không cần ai thao tác
