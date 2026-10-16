# Proposal

## Why

Người đăng hiện **không được báo** khi người duyệt quyết về tin của mình — đạt, từ chối, gỡ, khôi phục — và khi máy
giữ tin chờ người duyệt. Họ chỉ biết khi tự mở app và thấy trạng thái tin cùng lý do. Master cũng không nhận tin về từng
quyết định: ba thông báo của `review` (N40–N42) chỉ là nhắc vận hành (việc quá hạn, sắp chạm hạn, hậu kiểm dưới ngưỡng).

Đây là lỗ hổng giữa các change, tìm ra ngày 16/10/2026 khi rà luồng đăng tin sau lượt chạy khói trên dev:

- `add-review-queues` để "đưa thông báo tới người nhận" cho `add-notifications` (proposal, mục cố ý chưa làm) và chỉ
  viết requirement cho lúc master được nhắc — không requirement nào nói người đăng được báo kết quả.
- `add-notifications` bị thu hẹp ngày 11/10/2026 còn tin nhắn và đẩy lên điện thoại; câu "tin bị giữ hay được duyệt"
  chỉ còn ở mục Why của nó. `docs/VIEC-DANG-DO.md` mục 2 vẫn ghi việc này cho `add-notifications`.

TK đã hứa:

- TK 4 nguyên tắc 8 — **người dùng luôn biết mình đang ở đâu**: bị giữ thì biết đang chờ người duyệt và chờ tới bao
  giờ; lỗi tự sửa được thì được giải thích cụ thể; dấu hiệu gian lận nói ở mức chung.
- TK 17 — bảng kết quả của một quyết định: đạt, từ chối · gỡ vì sai sót (kèm lý do mẫu, "người đăng sửa rồi gửi lại"),
  từ chối · gỡ vì vi phạm, khôi phục.
- TK 24 — nhóm thông báo "tin đăng của bạn"; nhắc = hiện lên màn hình; câu nhắc không chứa lý do khoá, lý do cấm hay
  nội dung báo cáo; quyết định của nhóm ký "Quản trị nhóm".
- TK 27 cam kết 14 — "không ai bị chặn đăng, và luôn được biết vì sao".

Không thuộc một đợt riêng của TK 29: bù phần còn thiếu của đợt 4 (`review`) trên đường thông báo đã có từ đợt 1
(`add-notification-core`). Không cần thư viện hay dịch vụ mới — đẩy lên điện thoại vẫn là việc của `add-notifications`.

## What Changes

> Viết theo đề xuất ở mục **Câu hỏi mở** — chốt khác thì sửa trước khi viết design.

- Người đăng được báo, có nhắc, khi người duyệt (staff, master hay quản trị nhóm) cho đạt tin chờ duyệt, từ chối, gỡ
  hay khôi phục tin của mình. Từ chối · gỡ nêu lý do và nói rõ sửa rồi gửi lại được (sai sót) hay không (vi phạm).
- Người đăng được báo, có nhắc, khi máy giữ tin chờ người duyệt hay rút tin đang hiện về chờ duyệt — cùng mức với câu
  giải thích của máy: dấu hiệu gian lận chỉ nói ở mức chung, kèm thời gian chờ ước tính.
- Quyết định trong nhóm ký "Quản trị nhóm «tên nhóm»"; không thông báo nào nêu tên người duyệt.
- Câu nhắc hiện lên màn hình không chứa lý do từ chối hay gỡ; lý do chỉ nằm trong thông báo xem trong app.
- Không báo: máy cho qua ngay, hậu kiểm đạt tin đang hiện, mũi tên người đăng tự đi, quyết định không áp được.
- `docs/VIEC-DANG-DO.md` mục 2: bỏ việc này khỏi dòng `add-notifications`.

**Cố ý chưa làm trong change này:**

- Gậy (trích điều quy định, ngày hết) và khiếu nại thắng → `add-strikes`. Từ chối · gỡ vì vi phạm ở đây chỉ báo "vi
  phạm quy định sàn, không sửa để gửi lại được" — chưa có gậy để nêu.
- Báo kết quả báo cáo cho người báo → `add-reports`.
- Đẩy lên điện thoại → `add-notifications` (thông báo ở đây có cờ nhắc như mọi thông báo khác, banner realtime đã có).
- Báo người đăng khi tin hết hạn: đã có (nhắc trước 7 ngày, `listing/display-period`).

## Capabilities

### New Capabilities

- `notification/listing-notices`: báo người đăng chuyện về tin của mình do người khác hay máy làm — kết quả duyệt, máy
  giữ, máy rút về; ai ký, câu nhắc không lộ lý do, những chuyện không báo.

### Modified Capabilities

Không có.

## Impact

- Module `notification`: dòng ma trận mới cho `listing.state.changed` với mũi tên `approve`, `reject`, `remove`,
  `restore`, `hold`, `recall` — đã có bên nghe sự kiện này (N31, tin mới trong nhóm).
- Sự kiện hiện mang mũi tên và loại lỗi (`fault`) nhưng **không** mang lý do lẫn bên quyết (nhóm hay staff, master):
  design chọn thêm vào payload hay hỏi `listing` / `review` qua cổng. Câu của máy lấy từ `screening` (câu giải thích đã
  có cho người đăng).
- API: không đổi; thông báo đi qua hộp thư, số chưa đọc và realtime đã có.
- Migration: dự kiến không.

## Câu hỏi mở

1. **Báo những lúc nào.** Đề xuất: đạt (tin chờ duyệt lên bảng), từ chối, gỡ, khôi phục, máy giữ, máy rút về. Không
   báo: máy cho qua ngay khi gửi (người đăng thấy liền), hậu kiểm đạt một tin đang hiện (không có gì đổi với họ —
   kể cả khi lý do hạn chế "máy" được gỡ?).
2. **Lý do có lên câu nhắc không.** TK 24 chỉ cấm lý do khoá, lý do cấm, nội dung báo cáo trên câu nhắc. Đề xuất: câu
   nhắc chỉ nói kết quả ("Tin «Xe đạp cũ» chưa được duyệt"), lý do mẫu chỉ trong nội dung xem trong app — lý do vi phạm
   ("hàng cấm") không nên hiện trên màn hình khoá, và giữ một luật cho cả sai sót lẫn vi phạm.
3. **Máy giữ có cần thông báo không.** Tin chờ duyệt đã hiện câu giải thích trong app. Đề xuất: có, một thông báo khi
   bị giữ — đúng nguyên tắc 8 "bị giữ thì biết đang chờ" — nhưng không nhắc lại khi tin vẫn chờ.
4. **Ai ký.** Đề xuất: quyết định trong nhóm ký "Quản trị nhóm «tên nhóm»" (như `notification/group-notices`); quyết
   định của staff, master ký "Ghim" — không nêu tên ai. Hay staff ký "Người duyệt của Ghim"?
5. **Thứ tự.** Đề xuất làm **trước** `add-reports`: đây là lỗ ở luồng đang có (mọi tin bị giữ đều rơi vào), còn
   `add-reports` thêm luồng mới. Theo kế hoạch hiện tại, việc kế là các câu thông báo cũ của nhóm (N10–N14, N26–N28)
   rồi `add-reports`.
