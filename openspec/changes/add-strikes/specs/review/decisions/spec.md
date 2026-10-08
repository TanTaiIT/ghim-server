## ADDED Requirements

### Requirement: Từ chối hoặc gỡ vì vi phạm kèm gậy

Staff phụ trách danh mục của tin và master SHALL từ chối được một tin máy giữ, hoặc gỡ một tin đang hiển thị,
ở mức vi phạm. Quyết định vi phạm MUST chọn loại gậy và trích một điều trong quy định sàn; người đăng nhận
gậy đó ngay. Tin bị từ chối hay gỡ vì vi phạm MUST NOT sửa để gửi lại được — người đăng chỉ còn đường khiếu
nại.

#### Scenario: Staff từ chối vì vi phạm

- **WHEN** staff phụ trách danh mục từ chối một tin máy giữ ở mức vi phạm, chọn gậy thường và trích một điều
- **THEN** tin chuyển sang bị từ chối và người đăng có một gậy thường ghi tên staff cùng điều đã trích

#### Scenario: Thiếu điều trích

- **WHEN** staff chọn mức vi phạm mà không trích điều nào trong quy định sàn
- **THEN** response có HTTP 400 `VALIDATION_ERROR`, tin giữ nguyên trạng thái và người đăng không có gậy

#### Scenario: Điều hành viên chọn mức vi phạm

- **WHEN** điều hành viên nhóm từ chối một tin trong nhóm ở mức vi phạm
- **THEN** response có HTTP 403 `FORBIDDEN` và người đăng không có gậy

#### Scenario: Sửa tin vi phạm để gửi lại

- **WHEN** người đăng sửa một tin đang bị gỡ vì vi phạm
- **THEN** response có HTTP 409 `LISTING_UNDER_VIOLATION` và tin không đổi

### Requirement: Xác nhận việc nhóm chuyển lên

Staff phụ trách danh mục hoặc master, khác người đã chuyển lên, SHALL xác nhận hoặc bác một việc nhóm chuyển lên
vì trái quy định sàn. Xác nhận SHALL là một quyết định vi phạm: tin bị gỡ vì vi phạm và người đăng nhận gậy kèm
điều trích. Bác thì người đăng MUST NOT nhận gậy.

#### Scenario: Staff xác nhận

- **WHEN** điều hành viên chuyển lên một tin trong nhóm và staff của danh mục xác nhận, chọn gậy nặng, trích
  một điều
- **THEN** tin bị gỡ vì vi phạm và người đăng có một gậy nặng ghi tên staff đó

#### Scenario: Staff bác

- **WHEN** staff bác một việc nhóm chuyển lên
- **THEN** việc đóng và người đăng không có gậy

#### Scenario: Người chuyển lên tự xác nhận

- **WHEN** một người vừa là điều hành viên đã chuyển việc lên, vừa là staff của danh mục, xác nhận chính việc
  đó
- **THEN** response có HTTP 403 `FORBIDDEN` và việc vẫn chờ một người khác

### Requirement: Báo cáo đúng kèm gậy

Khi xử một báo cáo là đúng, staff hoặc master SHALL ra được gậy kèm điều trích cho người đăng tin bị báo cáo hay
người bị báo cáo, kể cả khi tin hay tài khoản đó đã bị chủ tự xoá. Điều hành viên xử báo cáo về tin nhóm MUST
NOT ra gậy.

#### Scenario: Báo cáo lừa đảo về tin sàn đúng

- **WHEN** staff xử một báo cáo lừa đảo về tin sàn là đúng, gỡ tin và ra gậy nặng kèm điều trích
- **THEN** người đăng tin có một gậy nặng

#### Scenario: Tin đã bị chủ tự xoá

- **WHEN** người đăng tự xoá tin sau khi bị báo cáo, rồi staff xử báo cáo đó là đúng kèm gậy thường
- **THEN** người đăng vẫn nhận gậy thường

#### Scenario: Tài khoản đã bị chủ tự xoá

- **WHEN** người bị báo cáo quấy rối xoá tài khoản trước khi báo cáo được xử, rồi trong 90 ngày tài khoản ẩn
  staff được giao việc an toàn xử báo cáo đó là đúng kèm gậy nặng
- **THEN** gậy nặng được ghi cho tài khoản đã xoá và đi theo email của nó

#### Scenario: Báo cáo về một người

- **WHEN** staff được giao việc an toàn xử một báo cáo quấy rối về một người là đúng, kèm gậy nặng
- **THEN** người bị báo cáo có một gậy nặng

#### Scenario: Điều hành viên thử ra gậy

- **WHEN** điều hành viên xử một báo cáo "sai thông tin" về tin nhóm là đúng và kèm một gậy
- **THEN** response có HTTP 403 `FORBIDDEN` và người đăng không có gậy

### Requirement: Nhật ký quyết định vi phạm ghi hậu quả thật

Mỗi quyết định vi phạm SHALL ghi vào nhật ký quyết định gậy đã ra — loại gậy và điều trích — cùng mức tin cậy
của người nhận ngay sau quyết định.

#### Scenario: Gỡ tin của người bán T2

- **WHEN** staff gỡ một tin vì vi phạm kèm gậy thường, người bán đang ở mức T2
- **THEN** nhật ký của quyết định ghi gậy thường, điều đã trích và mức T1 của người bán sau quyết định
