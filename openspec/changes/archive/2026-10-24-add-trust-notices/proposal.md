# Proposal

## Why

TK 24 có nhóm thông báo **"mức tin cậy và gậy"** mà người dùng bật tắt được, TK 4 nguyên tắc 8 hứa "bị phạt thì biết
ngày hết", và TK 27 cam kết 9 hứa mọi gậy có ngày hết hạn đọc được. Nhưng server chưa gửi thông báo nào thuộc nhóm đó.
`add-strikes` đẩy phần "báo khi nhận gậy, khi khiếu nại có kết quả, khi mức tin cậy đổi vì gậy" sang `add-notifications`
(proposal `add-strikes`, mục Không làm), còn `add-notifications` đã thu hẹp từ 11/10/2026 chỉ còn báo tin nhắn và đẩy
lên điện thoại — phần này rơi giữa hai change. Hiện người bị gỡ tin vì vi phạm chỉ nhận "Tin «X» đã bị gỡ.", không biết
mình nhận gậy, theo điều nào, khi nào hết, khiếu nại tới bao giờ — trừ khi tự mở bảng uy tín; khiếu nại có kết quả cũng
không ai báo. Lộ ra khi quét code ngày 22/10/2026 (`docs/VIEC-DANG-DO.md` mục 2).

Cùng lượt quét thấy **N36** — "tin trong nhóm máy giữ chờ duyệt", báo quản trị nhóm trong phạm vi, gộp, nhắc tối đa mỗi
30 phút (design `add-notification-core`, bảng N31–N36) — giao cho `add-review-queues` nhưng chưa từng được viết spec hay
code. Quản trị nhóm chỉ biết có việc khi tự mở hàng chờ, trong khi việc máy giữ có hạn 24 giờ (TK 28) và quá hạn thì
chuyển cấp. TK 24 đã nêu "việc chờ duyệt" trong các chuyện lặp lại theo nhóm được gộp.

Đợt: bổ sung đợt 6 (thông báo), dựng trên `add-strikes`, `add-review-queues`, `add-notifications` đã archive.

## What Changes

- Người nhận gậy SHALL được báo, có nhắc, trong nhóm "mức tin cậy và gậy": loại gậy, điều luật được trích, tin liên
  quan nếu có, ngày hết hạn (gậy nghiêm trọng: chờ master quyết), hạn khiếu nại. Ký "Ghim", không nêu ai ra gậy.
- Khiếu nại có kết quả SHALL được báo, có nhắc: thắng (gậy huỷ) hay thua (gậy giữ nguyên). Gậy thường quá hạn xét tự
  thắng thì báo như thắng; gậy nặng quá hạn chuyển master thì chưa báo tới khi master quyết.
- Gậy huỷ hay đổi ngoài khiếu nại SHALL được báo, có nhắc: ân xá; master quyết gậy nghiêm trọng (khoá vĩnh viễn, hạ
  thành gậy nặng, huỷ); khoá vĩnh viễn được gỡ khi xem lại.
- Gậy hết hạn và mức tin cậy đổi SHALL được báo (câu hỏi 1, 2).
- Vào thời gian chờ đăng tin vì dò cổng cứng SHALL được báo, có nhắc, bằng đúng câu mà lượt gửi trong lúc chờ đang
  nhận ("Tạm thời chưa gửi được tin mới — gửi lại từ …") — không nêu cổng cứng hay số lượt (TK 4 nguyên tắc 8, TK 13;
  câu hỏi 3).
- Gậy kế thừa khi đăng ký lại bằng cùng email SHALL được báo một lần (câu hỏi 4).
- N36: quản trị nhóm đang xử được việc SHALL được báo, có nhắc, khi tin trong nhóm bị máy giữ chờ duyệt — gộp theo
  nhóm, nhắc lại tối đa mỗi 30 phút (giá trị khởi đầu, TK 28 "nhắc lại thông báo gộp").
- Câu nhắc trên màn hình khoá chỉ nói chuyện gì xảy ra; điều luật, hạn và hệ quả chỉ nằm trong nội dung xem trong app
  (cùng luật với N45 của `notification/listing-notices`).

**Cố ý chưa làm**:

- Email khi tài khoản bị khoá (gậy nghiêm trọng): hiện `identity` không gửi thư khi khoá, mà người bị khoá không vào
  app đọc hộp thư được (câu hỏi 5).
- Báo master tới kỳ xem lại khoá vĩnh viễn: `review` đã mở việc ở hàng master, có nhắc hạn (N40).
- Báo người dùng khi họ tự gửi khiếu nại, khi xác nhận email xong, khi máy của họ bị đánh dấu hay gỡ dấu (dấu hiệu gian
  lận không bao giờ báo người dùng — TK 13), khi một hội thoại được mở (đã có N47 báo tin nhắn).
- Báo cáo về hội thoại với đội, kiểm ảnh nhạy cảm — change khác.

## Capabilities

### New Capabilities

- `notification/trust-notices`: báo người dùng về gậy, khiếu nại, mức tin cậy và thời gian chờ đăng tin của chính họ.

### Modified Capabilities

- `notification/group-notices`: thêm "Báo quản trị nhóm có tin chờ duyệt" (N36).

## Impact

- `notification`: ma trận mới nghe `trust.strike.issued`, `trust.strike.cancelled`, `trust.strike.expired`,
  `trust.strike.decided`, `trust.tier.changed`, `screening.cooldown.started` và hai sự kiện mới dưới đây. Dùng nhóm
  `trust_strikes` đã có trong enum — không migration enum. Mã thông báo mới N49 trở đi, đặt trong design.
- `trust`: thêm một sự kiện khi khiếu nại có kết quả, mang cả thua — hiện `decideAppeal` không phát gì khi thua. Không
  đổi bảng.
- `review`: thêm một sự kiện khi mở hay gộp việc hàng 0 về tin trong nhóm mà việc vào hàng quản trị nhóm. Người nhận
  tính theo luật "Việc vào hàng của ai" (`review/queues`), tính ở `review` lúc phát hay hỏi lại lúc gửi — chốt ở design.
- `screening`: không đổi — `screening.cooldown.started` đã có, chưa ai nghe.
- App `ghim-app`: hộp thư có thêm loại thông báo, `data` mở bảng uy tín, tin, hay hàng chờ của nhóm. Cập nhật
  `docs/realtime.md`, `docs/strikes.md`.
- TK 24: thêm dòng liệt kê chuyện được báo về gậy, khiếu nại, mức tin cậy, thời gian chờ — sửa cùng lượt chốt (22/10/2026).
- Không dự kiến migration bảng.
- **Đã chốt 22/10/2026** (người dùng chốt cả sáu câu theo đề xuất; spec viết theo đúng các điểm này):
  1. **Gậy hết hạn**: báo vào hộp thư, không nhắc; hết gậy mà đăng tin lại được thì câu nói rõ.
  2. **Mức tin cậy đổi**: báo cả lên lẫn xuống, nêu mức mới; lên không nhắc, xuống có nhắc.
  3. **Thời gian chờ vì dò cổng cứng**: báo lúc bắt đầu, có nhắc, bằng câu và mốc của lỗi 429 `SUBMISSION_COOLDOWN`
     kèm lối liên hệ hỗ trợ — lượt gửi trong lúc chờ vốn đã nhận đúng câu đó, nên không lộ thêm gì về ngưỡng.
  4. **Gậy kế thừa** khi đăng ký lại bằng cùng email: một thông báo nêu số gậy và ngày hết hạn, không nêu tài khoản
     trước.
  5. **Email khi bị khoá**: không làm trong change này; muốn thì là change riêng của `identity`.
  6. **N36**: chỉ người đang xử được việc theo luật hàng chờ nhận; số trong dòng gộp là số tin đang chờ hiện tại trong
     phạm vi người nhận — tính lại mỗi lần như N40–N42 (N20 thì đếm số lượt từ lúc đọc, không phải số hiện tại).
