# Proposal

## Why

Ghim nối người bán với người mua bằng tin nhắn: người mua thấy một tin, bấm nhắn để hỏi. TK 24 chốt cách nhắn:
mỗi hội thoại gắn với một tin, chỉ mở hội thoại mới với tin đang hiển thị mà mình xem được, hội thoại đã mở
không bị cắt ngang khi tin đã bán hay hết hạn, chặn người mà không bên nào biết ai chặn, và người ngoài không biết
hội thoại có tồn tại. TK 20 giới hạn số hội thoại mới mỗi ngày theo mức tin cậy để tài khoản vừa lập không nhắn
hàng loạt; TK 13 cho tin nhắn qua cùng bộ lọc cụm từ cấm như tin đăng; TK 23 cho báo cáo ngay từ hội thoại; TK 7
cho xoá tài khoản chỉ ẩn hội thoại phía người xoá; TK 19 cấm mở hội thoại mới về tin đã bán.

Đợt 6 theo TK 29. TK 27 không có cam kết riêng cho nhắn tin; change này giữ cho cam kết **5** (máy không ra gậy,
không hạ mức) đúng cả với bộ lọc tin nhắn, và cam kết **25** (báo cáo chỉ đóng bằng quyết định của người) đúng cả
với báo cáo gửi từ hội thoại.

## What Changes

- Mở hội thoại từ một tin: một tin và một người mua có đúng một hội thoại; chỉ mở mới với tin đang hiển thị mà
  mình xem được (tin "chỉ thành viên" thì phải là thành viên); không nhắn cho tin của mình; khách, tài khoản
  chưa xác nhận email và tài khoản master không nhắn tin.
- Gửi, đọc tin nhắn; hội thoại đã mở vẫn tiếp tục dù tin đã bán, hết hạn hay một bên rời nhóm.
- Hạn mức hội thoại mới mỗi ngày theo mức tin cậy (cột "hội thoại mới mỗi ngày" của TK 20).
- Tin nhắn qua bộ lọc cụm từ cấm của tin đăng — áp luật đã có, không định nghĩa lại.
- Người ngoài hội thoại nhận "không tìm thấy" cho mọi thao tác.
- Chặn người: không bên nào mở hội thoại mới, hội thoại cũ ngừng nhận tin, phản hồi giống hệt nhau cho hai bên.
- Xoá hội thoại và xoá tài khoản chỉ ẩn hội thoại ở phía người xoá.
- Báo cáo ngay từ hội thoại; người xử đọc được hội thoại dù các bên đã xoá ở phía mình.

**Cố ý chưa làm trong change này** (làm ở change sau, hoặc đã có chủ ở change trước):

- Thông báo khi có tin nhắn mới; không đẩy thông báo khi đang mở đúng hội thoại → `add-notifications`.
- Xoá hẳn hội thoại (cả hai bên đã xoá, hoặc 1 năm không ai nhắn) → `ops/data-retention` (`add-data-retention`).
- Giữ hội thoại dính báo cáo, gậy, khiếu nại đang mở không bị xoá hẳn, kể cả khi cả hai bên đã xoá →
  `ops/evidence-hold` (`add-data-retention`). Đợt này chưa có lượt xoá hẳn nào nên chưa cần tạm giữ.
- Luật cụm từ cấm (hai mức, cách so, ngoại lệ, chạy thử 7 ngày) → đã ở `screening/banned-phrases`
  (`add-screening`); change này chỉ áp bộ lọc đó cho tin nhắn.
- Luật chung của báo cáo (năm loại, 10 báo cáo mỗi giờ, gộp báo cáo, không lộ người báo, ai xử, hạn 72 giờ) →
  đã ở `review/reports` (`add-reports`); change này chỉ thêm đường gửi từ hội thoại.
- Tin sống, nhịp gửi → đã ở `trust/quotas` (`add-trust-tiers`); ở đây chỉ có cột hội thoại mới.
- Điều kiện tin sạch "đã bán và có ít nhất một người nhắn hỏi mua" (TK 20) → thuộc `trust/trust-tiers`; change
  này chỉ làm cho dữ kiện "có người nhắn hỏi mua" tồn tại.

## Capabilities

### New Capabilities

- `messaging/conversations`: mở hội thoại từ một tin, ai được nhắn, điều kiện mở hội thoại mới, gửi và đọc tin
  nhắn, hội thoại tiếp tục sau khi tin đổi trạng thái, hạn mức hội thoại mới mỗi ngày, bộ lọc cụm từ cấm cho tin
  nhắn, người ngoài nhận "không tìm thấy".
- `messaging/blocking`: chặn người, hội thoại cũ ngừng nhận tin, không bên nào biết ai chặn.
- `messaging/conversation-deletion`: xoá hội thoại và xoá tài khoản chỉ ẩn hội thoại phía người xoá.

### Modified Capabilities

- `review/reports` (tạo bởi `add-reports`; change này archive sau): báo cáo ngay từ hội thoại, người xử đọc được
  hội thoại bị báo cáo dù các bên đã xoá.

## Impact

- Module `messaging` (mới). Đọc từ `identity` (đã xác nhận email, tài khoản master, tài khoản đã xoá), `listing`
  (trạng thái tin, ai xem được tin), `group` (thành viên), `trust` (mức tin cậy hiện tại), `screening` (bộ lọc
  cụm từ cấm); báo cáo vẫn do `review` ghi.
- Phụ thuộc change trước, phải archive trước: `add-identity`, `add-groups`, `add-listings`, `add-trust-tiers`,
  `add-screening`, `add-reports`.
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): kênh realtime cho nhắn tin (hệ
  thống cũ dùng socket.io).
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Tin nhắn trúng cụm từ cấm thì sao: không gửi, gửi kèm cảnh báo cho người nhận, giữ lại chờ người xem (TK 16
    không có hàng chờ nào cho tin nhắn), hay chỉ ghi nhận làm dấu hiệu rủi ro; mức "chắc" và "mơ hồ" khác nhau
    thế nào. Spec chỉ hứa: cùng bộ lọc, không gậy, không hạ mức, không nêu cụm bị trúng.
  - "Mỗi ngày" của hạn mức hội thoại mới: theo ngày lịch (0 giờ giờ Việt Nam) hay 24 giờ cuốn chiếu.
  - TK 30 chỉ cho gọi đồng bộ ba chỗ, nhưng mở hội thoại cần mức tin cậy (hạn mức) và gửi tin cần bộ lọc cụm từ
    cấm ngay lúc gửi. Thêm hai chỗ gọi đồng bộ, hay `messaging` giữ bản sao nhận qua sự kiện?
  - Chặn: có gỡ chặn và xem danh sách người đã chặn không. "Không bên nào biết ai chặn" không giữ được với người
    không chặn ai — họ thấy hội thoại ngừng nhận tin thì tự suy ra bên kia chặn. Có cần giấu hẳn việc bị chặn
    (tin vẫn như đã gửi nhưng không tới) không? Spec chỉ hứa hai bên nhận cùng một phản hồi.
  - Đã xoá hội thoại ở phía mình rồi bên kia nhắn tiếp, hoặc mình bấm nhắn lại từ tin: hội thoại hiện lại với
    lịch sử cũ hay chỉ từ tin nhắn mới; lượt đó có tính vào hạn mức hội thoại mới không.
  - Bên kia đã xoá tài khoản: còn gửi tin vào hội thoại được không, hiện tên gì.
  - Hội thoại khi tin bị gỡ, bị tạm ẩn vì lý do khác rời nhóm, bị người đăng xoá, hoặc bên kia bị khoá — TK 24 chỉ
    nói đã bán, hết hạn, rời nhóm.
  - Nội dung tin nhắn: chỉ chữ hay có ảnh (nếu có ảnh thì có qua kiểm ảnh nhạy cảm không), độ dài tối đa, trạng
    thái đã đọc.
  - Master có đọc được mọi hội thoại (nguyên tắc 3) hay chỉ hội thoại đi kèm một báo cáo.
  - Báo cáo từ hội thoại là báo cáo về người hay về tin của hội thoại — quyết định ai xử (TK 23: staff việc an
    toàn hay staff danh mục / điều hành nhóm) và có tính vào ngưỡng tạm ẩn tin không. Trong hội thoại hai người,
    luật "người bị báo cáo không biết ai báo" cũng gần như vô nghĩa.
  - "Có ít nhất một người nhắn hỏi mua" của tin sạch: tính khi mở hội thoại hay khi có ít nhất một tin nhắn; tin
    nhắn trúng cụm từ cấm có tính không.
