# Design

> **Chờ duyệt.** Cách gọi và phạm vi do người dùng chốt 22/10/2026 (proposal, mục Why).

## Context

- Chữ "gậy" có ở 37 chuỗi của `ghim-server` (câu lỗi, câu thông báo, nhãn lý do trên bàn vận hành), 25 chuỗi của
  `ghim-app` (bàn vận hành), 162 chỗ trong TK; spec có 492 chỗ trong 31 file nhưng chỉ một chỗ trích nguyên văn câu người
  dùng đọc (`identity/account-deletion`, lý do "đang có gậy nặng").
- `ghim-app` mở màn theo `type` / `category` của thông báo và theo mã lỗi — không so chữ.

## Decisions

### 1. Bảng đối chiếu chữ hiển thị

| Trước                            | Sau                                        | Ví dụ câu mới                                                                   |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| gậy, gậy thường                  | cảnh cáo                                   | Bạn nhận một cảnh cáo vì tin «Xe đạp cũ» vi phạm quy định.                      |
| gậy nặng                         | cảnh cáo nặng                              | Bạn đang tạm mất vai trong nhóm vì có cảnh cáo nặng                             |
| gậy nghiêm trọng                 | vi phạm nghiêm trọng                       | Tài khoản bị khoá vì vi phạm nghiêm trọng.                                      |
| điểm gậy                         | điểm vi phạm                               | Bạn đang tạm khoá đăng tin vì điểm vi phạm — gửi lại được từ …                  |
| ra gậy                           | ghi cảnh cáo                               | Điều hành nhóm không ghi cảnh cáo được                                          |
| nhận gậy / có gậy                | nhận cảnh cáo / có cảnh cáo                | Trùng thiết bị với tài khoản có cảnh cáo                                        |
| huỷ gậy (khiếu nại thắng, ân xá) | xoá cảnh cáo                               | Khiếu nại được chấp nhận — cảnh cáo đã xoá. · Một cảnh cáo của bạn đã được xoá. |
| gậy hết hạn                      | cảnh cáo hết hạn                           | Một cảnh cáo nặng của bạn đã hết hạn.                                           |
| việc về gậy, hồ sơ / lịch sử gậy | việc về cảnh cáo, hồ sơ / lịch sử cảnh cáo | Lịch sử cảnh cáo                                                                |
| giữ gậy (khiếu nại thua)         | giữ cảnh cáo                               | Nút "Giữ cảnh cáo" / "Xoá cảnh cáo" trên bàn vận hành                           |
| hạ thành gậy nặng                | hạ thành cảnh cáo nặng                     | Tài khoản đã mở khoá; vi phạm nghiêm trọng đã hạ thành cảnh cáo nặng.           |
| nhóm "mức tin cậy và gậy"        | nhóm "mức tin cậy và cảnh cáo"             | (TK 24, nhãn trong app)                                                         |

Giữ nguyên: "khiếu nại", "ân xá", "khoá vĩnh viễn", "mức tin cậy", "tin sạch". "Cảnh cáo" là danh từ đếm được ("một
cảnh cáo", "2 cảnh cáo còn hiệu lực") nên câu kế thừa đổi thẳng: "Tài khoản mang theo 2 cảnh cáo còn hiệu lực."

### 2. N49 nói thêm ngưỡng tạm dừng đăng tin

`detail` của cảnh cáo thường / nặng thêm "Đủ N điểm vi phạm thì tạm dừng đăng tin mới." với N =
`strike.postingLockFromPoints` (3, giá trị khởi đầu) đọc lúc gửi — người mới biết hệ quả trước khi gặp lỗi 429 / 403
lúc đăng tin. Vi phạm nghiêm trọng không có câu này (tài khoản đã khoá).

### 3. Chỗ nào giữ thuật ngữ kỹ thuật

Code, mã lỗi, `type` thông báo, sự kiện, tên bảng giữ `strike` — đổi là đổi hợp đồng với app mà người dùng không thấy gì.
Spec giữ "gậy" như code: spec là hợp đồng cho người viết code, đổi 492 chỗ qua MODIFIED của 31 capability chỉ để đổi
một chữ không ai đọc ngoài đội — riêng câu trích nguyên văn người dùng đọc thì đổi (delta `identity/account-deletion`).
TK — bản cho người không làm kỹ thuật — đổi toàn bộ và thêm dòng từ điển nối hai cách gọi. Bỏ: đổi cả spec cho thống nhất
(chi phí lớn, rủi ro sót MODIFIED, không người dùng nào đọc spec).

### 4. Bài Trợ giúp "Cảnh cáo là gì?"

`ghim-app` thêm một chủ đề vào danh sách Trợ giúp (đang là dữ liệu trong app): cảnh cáo là gì, vì sao bị, tự hết sau bao
lâu, điểm vi phạm và ngưỡng tạm dừng đăng tin, khiếu nại thế nào, vi phạm nghiêm trọng khoá tài khoản. Con số lấy theo
giá trị khởi đầu của TK 28 — bài viết nói "thường là 90 ngày" để không lệch khi master đổi bảng con số.

## Risks / Trade-offs

- [Hai cách gọi giữa TK và spec / code] → dòng từ điển TK và một dòng trong CLAUDE.md; người viết code đọc spec, người
  dùng và staff đọc chữ hiển thị — không ai phải đọc cả hai.
- [Thông báo cũ trong hộp thư vẫn ghi "gậy"] → chữ nằm trong dòng đã ghi; không viết lại dữ liệu cũ (hộp thư giữ 90 ngày,
  TK 25).
- [App đang hiện câu lỗi của server nguyên văn] → đổi chữ ở server là đủ, không cần bản app mới cho câu lỗi.
