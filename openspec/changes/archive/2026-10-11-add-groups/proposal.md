# Proposal

## Why

Nhóm là nơi đăng tin thứ hai của Ghim, bên cạnh sàn chung: bảng tin riêng của một trường, công ty hay cộng
đồng, do chủ nhóm và điều hành viên giữ trật tự. TK 9 và TK 10 chốt nhóm ra đời thế nào (chỉ master lập, phải
có chủ mới nhận thành viên), bốn chế độ quyết định ai tìm thấy và vào bằng cách nào, đường vào của từng người
quyết định huy hiệu, và nhóm mất chủ thì đi qua giai đoạn thiếu chủ có hạn. Tin đăng ở đợt 2 cần sẵn nhóm,
thành viên và quyền mang huy hiệu để biết ai được đăng vào đâu.

Đợt 1 theo TK 29 ("nhóm"). Cam kết ở TK 27 mà change này đáp ứng: một phần **23** (chỉ thành viên vào bằng
đường được xét mới có huy hiệu), **24** (không nhóm nào hoạt động quá 30 ngày mà không có chủ nhóm — với
nguyên nhân "tài khoản chủ nhóm bị khoá"), một phần **22** (nhóm chỉ thành riêng tư sau khi mọi tin "nhóm
công khai" đã hạ), một phần **13** (đang là chủ nhóm thì không tự xoá được tài khoản), một phần **6** (cấm
khỏi nhóm chỉ có tác dụng trong nhóm, không đổi gì trên tài khoản toàn hệ thống).

## What Changes

- Vòng đời nhóm: chỉ master lập; loại nhóm chỉ để chọn sẵn cài đặt; mô tả nhóm; sáu trạng thái và đường chuyển;
  master tạm khoá (kèm lý do), mở khoá; nhóm khoá chỉ đọc; chủ nhóm hoặc master đóng vĩnh viễn, huỷ đơn, lời mời,
  lời giao chủ, mã nhóm.
- Chế độ: bốn chế độ, không có "riêng tư · mở cửa"; ai tìm thấy nhóm; đổi chế độ, công khai → riêng tư qua
  trạng thái chuyển; nhận tin người ngoài chỉ ở nhóm công khai; kiểu bảng tin.
- Thành viên: thứ tự xét vào nhóm (cấm → mở cửa → đơn → lời mời, danh sách lớp); hạn và giới hạn của đơn, rút
  đơn; lời mời theo email không dò được; danh sách lớp lưu email đã băm; mã nhóm; đường vào ghi lại và không đổi;
  đơn vị con (lập, xoá, xếp người); ai xem danh sách thành viên; tự rời, bị gỡ, bị cấm, gỡ cấm; điều hành viên
  không xử nhau; tài khoản master không vào nhóm.
- Vai: master giao chủ lần đầu (có hạn), chuyển nhượng chủ nhóm, master giao đè, bổ nhiệm và bãi nhiệm điều hành
  viên, bị khoá thì tạm mất vai, thiếu chủ (đề cử, master xác nhận bằng lời giao chủ, chủ cũ trở lại, quá 30 ngày
  hoặc hết điều hành viên thì tạm khoá, có chủ dùng được thì tự mở).
- Lưu thông báo của nhóm do chủ nhóm, điều hành viên gửi; việc đưa tới thành viên thuộc `add-notification-core`.
- Quyền mang huy hiệu: ai có quyền (đường vào được xét, chế độ nhóm, công tắc hiện tên), bấm tham gia không
  bao giờ có, tính lại ngay khi đổi cách vào hay công tắc, người ngoài bấm huy hiệu nhóm riêng tư chỉ thấy
  tên nhóm.
- Thêm vào `identity/account-deletion`: chủ nhóm phải chuyển chủ trước khi xoá tài khoản.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Mọi ảnh hưởng lên **tin** của nhóm: tin tạm ẩn khi nhóm khoá, khi người đăng rời / bị gỡ / bị cấm; hạ tin
  "nhóm công khai" khi sang riêng tư, tin người ngoài rời nhóm và 30 ngày chuyển lên sàn; không ai đăng mức
  "nhóm công khai" trong lúc chuyển; tin rời bảng khi nhóm đóng, 30 ngày chuyển lên sàn; người bị cấm không
  gửi tin vào nhóm; người ngoài chỉ đăng mức "nhóm công khai" → `add-listings`; tin tự gắn đơn vị con →
  `add-listings` (`listing/placement`).
- Huy hiệu **trên tin**: gắn vào tin, người đăng tự chọn gắn hay không; nhóm gỡ huy hiệu của mình khỏi tin
  nhưng không gỡ được tin sàn; huy hiệu tự gỡ khỏi tin khi người đăng mất quyền; huy hiệu ẩn khi nhóm tạm
  khoá → `add-listings` (thêm vào `group/badges`). Change này chỉ viết **quyền** mang huy hiệu.
- Người ngoài tối đa 2 tin sống mỗi nhóm → `add-trust-tiers` (`trust/quotas`).
- Giữ vai chủ nhóm, điều hành viên cần T1 trở lên → `add-trust-tiers` (thêm vào `group/group-roles`).
- Gậy nặng thì tạm mất vai; chủ nhóm nhận gậy nặng thì nhóm thiếu chủ → `add-strikes` (thêm vào
  `group/group-roles`).
- Đóng nhóm huỷ việc đang chờ của nhóm; rời / bị gỡ / bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ;
  xử tin máy giữ, gỡ tin khỏi nhóm → `add-review-queues`. Báo cáo lừa đảo, hàng cấm của nhóm đã đóng vẫn được
  staff xử → `add-reports`.
- Huy hiệu không làm tin được duyệt dễ hơn → `add-screening` (máy duyệt không dùng huy hiệu làm dấu hiệu).
- Báo từng chuyện của nhóm cho đúng người (ma trận ở design mục 13), hộp thư, realtime, gửi thông báo của nhóm tới
  thành viên → `add-notification-core`, làm cùng lượt (chốt 11/10/2026). `group` chỉ phát sự kiện outbox.
- Hội thoại đã mở vẫn tiếp tục khi một bên rời nhóm → `add-messaging`.
- Dữ liệu của nhóm đã đóng xoá hẳn sau hạn lưu → `add-data-retention`.
- Cựu thành viên (học sinh ra trường, theo năm học) → change sau; đường rời giữ chỗ `alumni` trong dữ liệu.

## Capabilities

### New Capabilities

- `group/group-lifecycle`: lập nhóm (chỉ master), loại nhóm, trạng thái và đường chuyển, tạm khoá / mở khoá,
  đóng nhóm.
- `group/group-modes`: bốn chế độ, tìm thấy nhóm, đổi chế độ, nhận tin người ngoài, kiểu bảng tin.
- `group/membership`: vào nhóm theo chế độ, đơn, lời mời, danh sách lớp, mã nhóm, đường vào, đơn vị con, danh
  sách thành viên, rời / gỡ / cấm.
- `group/group-roles`: giao và chuyển chủ nhóm, điều hành viên, tạm mất vai khi bị khoá, thiếu chủ.
- `group/badges`: quyền mang huy hiệu nhóm, công tắc hiện tên, tính lại quyền, người ngoài chỉ thấy tên nhóm
  riêng tư.

### Modified Capabilities

- `identity/account-deletion`: chủ nhóm phải chuyển chủ trước khi xoá tài khoản (tạo bởi `add-identity`;
  change này archive sau).

## Impact

- Module `group` (mới). App dùng tìm nhóm, vào nhóm, quản lý thành viên và cài đặt; bàn vận hành dùng lập
  nhóm, giao chủ, khoá nhóm, xác nhận chủ mới.
- Phụ thuộc `add-identity` (tài khoản, khoá / mở khoá tài khoản — nguyên nhân thiếu chủ và tạm mất vai — và
  xoá tài khoản) và `add-platform-roles` (ai là master).
- Việc theo lịch (đơn, lời mời, lời giao chủ hết hạn; thiếu chủ quá hạn) chạy bằng pg-boss đã có.
- Câu hỏi mở của bản proposal đầu đã chốt ngày 11/10/2026 — xem design mục 2 và bảng "Đã chốt".
