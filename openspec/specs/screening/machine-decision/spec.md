# screening/machine-decision Specification

## Purpose

Quyết định mỗi tin vừa gửi được hiện ngay hay phải chờ người, với đúng ba kết quả và không bao giờ phạt ai:
máy chắc thì cho qua, không chắc thì giữ cho người (TK 13, cam kết 5).

## Requirements

### Requirement: Máy chỉ có ba kết quả

Mỗi lượt qua máy SHALL kết thúc bằng đúng một trong ba kết quả: hiện đầy đủ, hiện hạn chế, hoặc giữ cho
người. Máy MUST NOT từ chối tin, trả tin về nháp, ra gậy hay hạ mức tin cậy của bất kỳ ai — kể cả khi tin
dính cổng cứng.

#### Scenario: Tin đạt chuẩn

- **WHEN** tài khoản T2 gửi một tin không trúng dấu hiệu rủi ro nào
- **THEN** kết quả máy là hiện đầy đủ, không qua người nào

#### Scenario: Tin rủi ro cao

- **WHEN** tài khoản T2 gửi một tin có điểm rủi ro 75
- **THEN** kết quả máy là giữ cho người, tin không bị từ chối, và tài khoản không nhận gậy nào, vẫn ở mức T2

#### Scenario: Tin dính cổng cứng

- **WHEN** một tin chứa cụm từ cấm mức chắc được gửi
- **THEN** kết quả máy là giữ cho người, tin không trở về nháp, và người đăng không nhận gậy nào

### Requirement: Kết quả máy ghi lại căn cứ và phiên bản đã dùng

Mỗi kết quả máy SHALL ghi lại điểm rủi ro, dải, các luật và cổng cứng đã trúng, mức tin cậy đã dùng, cùng
phiên bản bảng con số và phiên bản luật đã dùng. Kết quả đã ghi MUST NOT đổi khi master chỉnh bảng con số
hay luật về sau.

#### Scenario: Ghi các luật đã trúng

- **WHEN** tin của một tài khoản T1 trúng "giá bất thường" và "liên hệ ngoài sàn"
- **THEN** kết quả máy ghi cả hai luật, điểm 45, dải Vừa và mức T1

#### Scenario: Master phát hành bảng con số mới

- **WHEN** một tin đã được chấm theo một phiên bản bảng con số, rồi master phát hành phiên bản mới
- **THEN** kết quả của tin đó vẫn mang phiên bản cũ, còn lượt qua máy kế tiếp của bất kỳ tin nào mang
  phiên bản mới

### Requirement: Lỗi khi chấm thì giữ cho người

Khi việc chấm chữ hoặc kiểm một ảnh báo lỗi hay không trả lời, kết quả SHALL là giữ cho người. Lỗi của máy
MUST NOT bao giờ dẫn tới cho qua, và tin vẫn được nhận chứ không bị trả lỗi cho người đăng.

#### Scenario: Chấm chữ lỗi

- **WHEN** việc chấm chữ báo lỗi lúc một tin được gửi
- **THEN** tin không bị từ chối và kết quả máy là giữ cho người

#### Scenario: Kiểm một ảnh lỗi

- **WHEN** chữ của tin không trúng dấu hiệu nào nhưng việc kiểm một trong các ảnh báo lỗi
- **THEN** kết quả máy là giữ cho người, không phải hiện đầy đủ hay hiện hạn chế

### Requirement: Đang kiểm quá 5 phút thì giữ cho người

Tin ở trạng thái đang kiểm quá 5 phút (giá trị khởi đầu) mà chưa đủ kết quả cho chữ và mọi ảnh SHALL bị giữ
cho người. Hệ thống SHALL rà các tin đang kiểm mỗi 5 phút. Kết quả về muộn sau khi tin đã bị giữ MUST NOT tự
đưa tin lên bảng (TK nguyên tắc 2).

#### Scenario: Còn ảnh chưa có kết quả sau 5 phút

- **WHEN** một tin đã ở trạng thái đang kiểm hơn 5 phút, còn một ảnh chưa có kết quả, và lượt rà chạy
- **THEN** kết quả máy là giữ cho người và tin không hiện với người khác

#### Scenario: Chưa tới 5 phút

- **WHEN** lượt rà chạy lúc một tin mới ở trạng thái đang kiểm được 2 phút
- **THEN** tin vẫn ở trạng thái đang kiểm, chưa bị giữ

#### Scenario: Kết quả ảnh về muộn

- **WHEN** tin đã bị giữ vì quá 5 phút, rồi kết quả của ảnh còn thiếu về và không trúng gì
- **THEN** tin vẫn chờ người duyệt, không tự hiện

### Requirement: Tin đang hiện mà thiếu kết quả ảnh thì chuyển sang hạn chế

Lượt rà mỗi 5 phút SHALL tìm tin đang hiển thị có ảnh chưa có kết quả kiểm và chuyển tin đó sang hiển thị
hạn chế với lý do "máy" (chốt 12/10/2026) — lưới an toàn cho trường hợp lẽ ra không xảy ra (cam kết 4).

#### Scenario: Tin hiện đầy đủ thiếu kết quả ảnh

- **WHEN** lượt rà thấy một tin đang hiện đầy đủ có một ảnh chưa có kết quả kiểm
- **THEN** tin chuyển sang hiển thị hạn chế với lý do "máy"

#### Scenario: Tin đủ kết quả

- **WHEN** lượt rà gặp một tin đang hiện đầy đủ đã có kết quả cho mọi ảnh
- **THEN** tin giữ nguyên mức hiển thị đầy đủ
