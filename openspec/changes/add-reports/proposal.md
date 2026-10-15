# Proposal

## Why

Máy và hậu kiểm chỉ thấy tin lúc nó lên bảng; người mua thấy cả những gì xảy ra sau đó — lừa đảo, quấy rối,
hàng cấm. TK 23 chốt đường để họ báo: năm loại báo cáo cố định, gộp báo cáo cùng đối tượng, lừa đảo và hàng cấm
trong nhóm đi thẳng tới staff, báo cáo chỉ đóng bằng quyết định của người, tạm ẩn khi nhiều người đáng tin cùng
báo, và điểm tin cậy báo cáo để báo bừa mất sức nặng. TK 8 cho dấu thiết bị để ngưỡng tạm ẩn đếm theo máy, chặn
một người lập nhiều tài khoản để hạ tin đối thủ.

Đợt 4 theo TK 29 (người duyệt: sau hàng máy giữ là báo cáo). Cam kết ở TK 27 mà change này đáp ứng: **25**,
**26**, và một phần **1** (không ai xử báo cáo về mình), **7** (báo cáo quá hạn chỉ chuyển master, vẫn ẩn),
**8** (gộp báo cáo, lừa đảo và hàng cấm thắng), phần báo cáo của **13** (có báo cáo mở vẫn xoá được tài khoản
và báo cáo vẫn được xử), **20** (tạm ẩn vì báo cáo không đổi trạng thái, không mất ngày).

## What Changes

- Gửi báo cáo về một tin hay một người, năm loại cố định; không tự báo mình; tài khoản master không báo cáo;
  tối đa 10 báo cáo mỗi giờ; gộp lượt báo cùng đối tượng, chỉ tăng số người báo.
- Ai xử: tin sàn → staff danh mục; tin nhóm loại lừa đảo, hàng cấm → staff danh mục, điều hành nhóm không thấy;
  tin nhóm loại khác → điều hành nhóm; một người → staff việc an toàn. Lừa đảo, hàng cấm thắng khi gộp. Quá 72
  giờ chuyển master.
- Đúng / bác; hệ quả của "đúng" theo quyền người xử (gỡ tin, gỡ khỏi nhóm, cấm khỏi nhóm, khoá tài khoản);
  quyết định đóng mọi lượt báo đã gộp; người báo được báo kết quả; người bị báo không biết ai báo; báo cáo chỉ
  đóng bằng quyết định của người.
- Tạm ẩn tin sàn khi 3 người, 3 máy, từ T1, điểm báo cáo bình thường, báo trong 24 giờ; không tự hiện lại theo
  giờ; bác thì hiện lại không mất ngày; mỗi tin chỉ tự ẩn một lần giữa hai quyết định của người.
- Điểm tin cậy báo cáo: bác −1, đúng +1; dưới −3 xếp cuối hàng và không tính ngưỡng tạm ẩn; dưới −6 mất quyền
  báo cáo 30 ngày; không phải án phạt.
- Thêm vào capability của change trước: có báo cáo mở vẫn tự xoá được tài khoản, báo cáo vẫn xử trên bản lưu
  trong 90 ngày tài khoản ẩn; tin có báo cáo mở vẫn xoá được, báo cáo vẫn xử trên bản lưu; đóng nhóm không huỷ
  báo cáo lừa đảo, hàng cấm.

**Cố ý chưa làm trong change này** (làm ở change sau, hoặc đã có ở change khác):

- Báo cáo đúng kèm gậy, kể cả khi tin hay tài khoản đã bị chủ tự xoá → `add-strikes` (thêm vào
  `review/decisions`); gậy ra cho tài khoản đã xoá đi theo email, đăng ký lại bằng cùng email thì kế thừa →
  `add-strikes` (`identity/registration`). Change này không nói tới gậy vì gậy có từ đợt 5.
- Báo cáo ngay từ hội thoại; người xử đọc được hội thoại bị báo cáo → `add-messaging` (thêm vào
  `review/reports`).
- Đưa thông báo kết quả tới người báo qua hộp thư và điện thoại → `add-notifications`; change này chỉ nói khi
  nào người báo được báo và cho họ xem kết quả trong danh sách báo cáo của mình.
- Dữ liệu dính tới báo cáo đang mở không bị xoá hẳn — kể cả khi tài khoản đã xoá quá 90 ngày — giữ tới khi
  báo cáo đóng thêm 30 ngày → `add-data-retention` (`ops/evidence-hold`).
- Tin có báo cáo được xác nhận đúng không là tin sạch → đã có ở `trust/trust-tiers` (`add-trust-tiers`).
- Không đổi nơi đăng khi tin đang bị báo cáo → đã có ở `listing/editing` (`add-listings`).
- Sáu hàng chờ, hạn 72 giờ của hàng 1, gộp việc về cùng một tin, nhận việc, luật không xử việc của mình →
  đã có ở `add-review-queues`.

## Capabilities

### New Capabilities

- `review/reports`: gửi báo cáo, năm loại, giới hạn, gộp, ai xử, quá hạn, đúng / bác và hệ quả, người báo được
  báo kết quả, giấu danh tính người báo, báo cáo chỉ đóng bằng quyết định của người.
- `review/report-auto-hide`: ngưỡng tạm ẩn khi nhiều người báo, tạm ẩn chờ người xử, bác thì hiện lại, mỗi tin
  chỉ tự ẩn một lần giữa hai quyết định.
- `review/reporter-score`: điểm tin cậy báo cáo, xếp cuối hàng, mất quyền báo cáo 30 ngày, không phải án phạt.

### Modified Capabilities

- `identity/account-deletion` (tạo bởi `add-identity`; change này archive sau): có báo cáo mở vẫn tự xoá được
  tài khoản; báo cáo không đóng, được xử trên bản lưu trong 90 ngày tài khoản ẩn, kết quả "đúng" vẫn áp.
- `listing/deletion` (tạo bởi `add-listings`; change này archive sau): tin có báo cáo mở vẫn xoá được, báo cáo
  vẫn được xử trên bản lưu.
- `group/group-lifecycle` (tạo bởi `add-groups`; change này archive sau): đóng nhóm không huỷ báo cáo lừa đảo,
  hàng cấm về tin trong nhóm.

## Impact

- Module `review` (đã có từ `add-review-queues`): thêm báo cáo, cờ tạm ẩn vì báo cáo (đi qua outbox sang
  `listing`), điểm báo cáo. App Ghim: nút báo cáo, danh sách báo cáo của tôi. Bàn vận hành và app của điều hành
  nhóm: báo cáo trong hàng chờ.
- Phụ thuộc change trước: `add-identity` (dấu thiết bị lúc báo, khoá tài khoản, xoá tài khoản),
  `add-platform-roles` (staff việc an toàn, tài khoản master), `add-groups` (phạm vi điều hành, cấm khỏi nhóm,
  đóng nhóm), `add-listings` (tạm ẩn, xoá tin, ai thấy một tin), `add-trust-tiers` (mức T1 của người báo),
  `add-review-queues` (hàng 1, gộp việc, nhận việc, luật xung đột, nhật ký quyết định).
- **Phải chọn trước khi làm**: không cần thư viện hay dịch vụ mới; job nền chuyển cấp báo cáo quá hạn dùng
  chung với `add-review-queues`.
- **Đã chốt 08/10** (TK 7, TK 23, cam kết 13 đã sửa theo): có báo cáo đang mở vẫn xoá được tài khoản; tài
  khoản ẩn 90 ngày, báo cáo vẫn xử trên bản lưu; báo cáo đúng thì gậy vẫn ghi, đi theo email. Các điều kiện
  chặn xoá còn lại giữ nguyên.
- **Câu hỏi mở** — TK không nói hoặc tự mâu thuẫn, cần người dùng chốt trước khi viết design:
  - Sơ đồ TK 18 không có mũi tên "gỡ" từ Đã bán, Hết hạn — hai trạng thái người lạ vẫn xem được. Báo cáo đúng về
    một tin đã bán hay hết hạn thì xử thế nào? (Chuyển từ `add-listings` ngày 12/10/2026.)
  - Báo cáo gửi tới **sau** khi tài khoản đã xoá (vd từ hội thoại mà người kia vẫn đọc được) có nhận không, và
    có xử trên bản lưu như báo cáo đã mở từ trước không. Spec chỉ viết báo cáo đang mở lúc xoá.
  - **TK tự mâu thuẫn**: TK 10 nói đóng nhóm thì "việc đang chờ của nhóm: huỷ" (trừ báo cáo lừa đảo, hàng cấm),
    còn cam kết 25 nói báo cáo chỉ đóng bằng quyết định của người. Báo cáo loại khác về tin trong nhóm bị huỷ
    hay vẫn chờ người xử khi nhóm đóng? Nếu huỷ thì người báo có được báo và điểm báo cáo có đổi không. Change
    này chỉ viết phần lừa đảo, hàng cấm.
  - "Mỗi tin chỉ tự ẩn một lần giữa hai quyết định của người": sau khi bác, quyết định nào của người làm tin
    tự ẩn lại được — bất kỳ quyết định nào về tin, hay chỉ quyết định về báo cáo mới.
  - Báo cáo "đúng" có bắt buộc kèm ít nhất một hệ quả không. Trước khi có gậy (đợt 5), staff việc an toàn xử
    báo cáo về một người chỉ còn "đúng" không hệ quả, vì khoá tài khoản là của master. Báo cáo đúng mà tin
    không bị gỡ (hệ quả chỉ là khoá, hay sau này chỉ là gậy) thì cờ tạm ẩn gỡ hay giữ.
  - Báo cáo đúng về tin đã bán hay hết hạn: TK 18 không có mũi tên "gỡ" từ hai trạng thái đó (cùng câu hỏi ở
    `add-listings`). Báo cáo đúng về tin đã xoá hay tin của tài khoản đã xoá: hệ quả "gỡ tin" có áp được không.
  - Người chưa xác nhận email có báo cáo được không (TK 7 chỉ chặn đăng tin, nhắn tin).
  - Một người báo lại cùng đối tượng khi báo cáo còn mở: trả lỗi hay nhận im lặng.
  - Người đã gửi báo cáo có được xử chính báo cáo đó không (nguyên tắc 4 không liệt kê).
  - Người xử có thấy danh tính người báo không; báo cáo có kèm lời mô tả tự do không; "báo cáo liên quan" gồm
    cả báo cáo đã đóng không.
  - Điểm báo cáo: sau 30 ngày mất quyền, điểm có đặt lại không; bị bác tiếp khi vẫn dưới −6 có tính thêm 30
    ngày không. "Xếp cuối hàng" với báo cáo gộp có cả người điểm thấp lẫn người bình thường.
  - Lượt báo không có dấu thiết bị (vd gửi từ web) có được đếm vào ngưỡng tạm ẩn không.
  - TK 23 chỉ nói "tin sàn" bị tạm ẩn khi nhiều người báo; change này viết đúng như vậy (tin trong nhóm, kể cả
    nhóm công khai, không tự ẩn) — cần xác nhận đó là ý định.
