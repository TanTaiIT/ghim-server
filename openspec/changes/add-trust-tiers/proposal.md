# Proposal

## Why

Mức tin cậy quyết định một người đăng được bao nhiêu và tin hiển thị rộng tới đâu (TK 1, quyết định 12). TK 20
chốt bốn mức T0–T3 **tính lại** từ tuổi tài khoản, tin sạch và gậy — thay bậc uy tín 0–2 cộng trừ theo từng lần
duyệt của hệ thống đang chạy (TK 4, bảng "Khác gì") — cùng hạn mức tin sống và nhịp gửi theo mức, và một bảng
uy tín để người bán luôn biết mình đang ở đâu (nguyên tắc 8). TK 5: giữ vai chủ nhóm hay điều hành viên cần
mức T1 trở lên. Máy duyệt (TK 13, TK 14), hậu kiểm và báo cáo đều đọc mức này, nên nó phải có trước đợt 3.

Đợt 2 theo TK 29 ("Tin đăng · mức tin cậy · hạn mức — phần tính toán thuần trước"). Cam kết ở TK 27 mà change
này đáp ứng: **11** (mức tin cậy tính lại hai lần ra cùng một kết quả), **18** (mỗi lượt qua máy, kể cả gửi
lại, đếm vào nhịp gửi; tin sống và nhịp gửi đếm chung mọi nơi), một phần **20** (tin tạm ẩn không chiếm hạn
mức), một phần **33** (mức tin cậy ghi lại phiên bản bảng con số đã dùng), và đặt nền cho **15** (định nghĩa
T0; hiển thị hạn chế do `add-listings` và `add-screening`).

## What Changes

- Bốn mức T0–T3 với điều kiện tuổi tài khoản và số tin sạch.
- Tin sạch: hiển thị ít nhất 7 ngày, hoặc đã bán sau ít nhất 2 ngày hiển thị và có người nhắn hỏi mua; không
  bị gỡ vì vi phạm, không bị báo cáo đúng; tối đa 3 tin sạch được tính trong mọi 7 ngày cuốn chiếu. Tin bị gỡ vì
  sai sót không bị trừ, chưa được cộng: sửa xong, hiện lại đủ 7 ngày thì thành tin sạch như thường.
- Mức tính lại từ toàn bộ dữ kiện và phiên bản bảng con số, không cộng trừ; tính hai lần ra cùng kết quả; tính
  lại ngay khi có chuyện mới và mỗi ngày cho dữ kiện đổi theo thời gian.
- Hạn mức tin sống và nhịp gửi theo mức, đếm chung mọi nơi; trần riêng 2 tin sống mỗi nhóm của người ngoài;
  vượt trần không gỡ tin đang sống; gia hạn sớm không chiếm thêm chỗ, gia hạn tin hết hạn cần còn chỗ, đang vượt
  trần thì không gia hạn được; hết chỗ thì báo tin nào đang chiếm chỗ.
- Bảng uy tín của người bán: mức, điều còn thiếu để lên mức, hạn mức còn lại, tin đang hạn chế, tin đang chờ
  người duyệt — tin chờ vì dấu hiệu gian lận kèm câu chung ba phần (TK 4 nguyên tắc 8, TK 13), không nêu tín hiệu.
- Giữ vai chủ nhóm, điều hành viên cần mức T1 trở lên.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Mọi điều kiện về gậy → `add-strikes` (đợt 5): T2 "không có gậy đang hiệu lực", T3 "không nhận gậy nào
  trong 90 ngày gần nhất", có gậy thì trần là T1, gậy bị huỷ coi như chưa có, gậy hết hạn thì tính lại, danh
  sách gậy trên bảng uy tín, gậy nặng thì tạm mất vai trong nhóm.
- Số hội thoại mới mỗi ngày theo mức → `add-messaging` (`messaging/conversations`), không thuộc hạn mức.
- Thông báo khi lên hay xuống mức → `add-notifications`.
- Lý do hạn chế "tài khoản mới" (đặt khi T0 đăng ra nơi công khai, gỡ khi lên T1); ghép mọi điều kiện gửi tin
  (email đã xác nhận, danh mục bật, tư cách trong nhóm) → `add-listings` (`listing/visibility`,
  `listing/submission`).
- Máy dùng mức tin cậy — ma trận dải × mức, ngưỡng đăng dồn theo mức, thời gian chờ sau 3 lần dính cổng cứng
  → `add-screening`. Mẫu hậu kiểm 20% tin T0–T1 → `add-review-queues`. Ngưỡng tạm ẩn "từ T1" của báo cáo →
  `add-reports`.
- Phát mã tra cứu cho tin chờ vì dấu hiệu gian lận; hỗ trợ nhập mã để thấy lý do cụ thể và gỡ khi đúng là nhầm
  → `add-screening`. Bảng uy tín chỉ hiện câu chung và mã.
- Xác thực số điện thoại làm dữ kiện của mức — hoãn theo TK 29.

## Capabilities

### New Capabilities

- `trust/trust-tiers`: bốn mức, tin sạch, giới hạn 3 tin sạch mỗi 7 ngày, tính lại từ dữ kiện, tính hai lần
  ra cùng kết quả.
- `trust/quotas`: trần tin sống và nhịp gửi theo mức, trần riêng của người ngoài, vượt trần, báo tin chiếm chỗ.
- `trust/seller-dashboard`: bảng uy tín của người bán.

### Modified Capabilities

- `group/group-roles` (tạo bởi `add-groups`; change này archive sau): chỉ tài khoản từ mức T1 trở lên nhận
  được vai chủ nhóm hay điều hành viên.

## Impact

- Module `trust` (mới), phần tính toán thuần; `listing` hỏi `trust` hạn mức lúc gửi (CLAUDE.md luật 12, gọi
  đồng bộ).
- Phụ thuộc change trước: `add-identity` (tuổi tài khoản, email đã xác nhận), `add-platform-roles` (bảng con số
  có phiên bản), `add-groups` (vai trong nhóm, người ngoài), `add-listings` (trạng thái tin, tạm ẩn, lý do hạn
  chế — cùng đợt 2, archive trước change này).
- Dữ kiện chỉ có ở đợt sau: "báo cáo được xác nhận đúng" (`add-reports`, đợt 4) và "người nhắn hỏi mua"
  (`add-messaging`, đợt 6). Luật tin sạch viết đủ ở đây vì bảng phân công không giao phần này cho change nào
  khác. Trước khi hai đợt đó xong, mọi tin thoả điều kiện báo cáo, và không tin nào thành tin sạch theo lối
  "đã bán" — mức chỉ lên bằng lối 7 ngày hiển thị.
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): cơ chế việc chạy nền theo lịch
  cho lượt tính lại hằng ngày.
- **Đã chốt 08/10** (TK 3, 19, 20): "không bị gỡ" là "không bị gỡ vì vi phạm"; tin bị gỡ vì sai sót không bị
  trừ, sửa xong hiện lại đủ 7 ngày thì thành tin sạch. Gia hạn sớm không chiếm thêm chỗ, nên gia hạn khi số tin
  sống đúng bằng trần là được; chỉ chặn khi đang vượt trần.
- **Đã chốt 12/10/2026** (design mục 2): tin sạch vượt giới hạn được dời, không bỏ; khôi phục hay khiếu nại
  thắng trả lại tư cách tin sạch; 7 ngày cộng dồn lúc tin được thấy (tạm ẩn không tính); tin sạch còn tính sau khi
  tin bị xoá; người hỏi mua dùng chung máy với người bán không tính; tuổi tài khoản từ lúc tạo; tụt dưới T1 không
  mất vai, chỉ chặn nhận vai mới; câu hết chỗ nêu rút tin chờ duyệt về nháp thay cho "chờ tin được duyệt"; bảng con
  số mới áp ở lần tính kế tiếp, lượt hằng ngày tính lại mọi tài khoản theo phiên bản cũ; thêm
  `trust.cleanShownDays` 7; thời gian chờ trên bảng uy tín thuộc `add-screening`. Việc nền chạy trên pg-boss.
- **Câu hỏi mở**: không còn.
