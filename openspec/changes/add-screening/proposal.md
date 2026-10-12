# Proposal

## Why

Đợt 2 đã có tin đăng, nơi đăng, mức tin cậy và hạn mức, nhưng chưa có gì quyết một tin vừa gửi được hiện
ngay hay phải chờ người. TK 13 và TK 14 chốt máy duyệt: máy quyết phần chắc, người quyết phần máy không chắc
(nguyên tắc 1); máy chỉ cho qua — đầy đủ hoặc hạn chế — hoặc giữ cho người, không bao giờ từ chối hay phạt
(nguyên tắc 7); không chắc thì giữ. TK 8 chốt hệ quả của dấu thiết bị: tài khoản thứ 4 trên một máy không bị
chặn mà mọi tin của nó chờ người. TK 11 cho máy bốn cài đặt của danh mục: trần giá, giá tham chiếu, mức rủi ro
(mức cao cộng điểm) và luôn duyệt tay (giữ mọi tin). TK 4 nguyên tắc 8 và TK 13 chốt câu báo: lỗi tự sửa được
thì nói cách sửa, dấu hiệu gian lận thì một câu chung ba phần kèm mã tra cứu. TK 26 thêm lưới an toàn 5 phút để
không tin nào kẹt ở "đang kiểm".

Đợt 3 theo TK 29 ("Máy duyệt, kể cả kiểm ảnh"). Cam kết ở TK 27 mà change này đáp ứng: **4** (không tin nào
hiện khi chưa có kết quả cho cả chữ lẫn mọi ảnh), **5** (máy chỉ có hai lối ra, không từ chối, không ra gậy,
không hạ mức), **14** (phần hệ quả: tài khoản thứ 4 không có tin nào tự lên bảng, không bị chặn đăng, luôn
được biết vì sao — phần đánh dấu đã có ở `add-identity`), một phần **15** (máy không cho tin của T0 hiện đầy
đủ ở nơi công khai), **16** (cụm từ cấm mức chắc không tự lên bảng; bật cụm mới thì máy rút tin đang hiện về
chờ duyệt — mũi tên Đang hiển thị → Chờ duyệt, không từ chối), **29** (giá 0 không bị coi là giá bất
thường, có luật riêng ở danh mục giá trị cao), một phần **33** (mỗi kết quả máy ghi lại bộ con số và phiên
bản luật đã dùng).

## What Changes

- Máy chỉ có ba kết quả: hiện đầy đủ, hiện hạn chế, giữ cho người. Lỗi khi chấm hay quá 5 phút chưa đủ kết
  quả thì giữ; kết quả về muộn không tự mở tin. Lưới an toàn mỗi 5 phút: tin đang kiểm quá 5 phút thì giữ,
  tin đang hiện thiếu kết quả ảnh thì chuyển sang hạn chế. Mỗi kết quả ghi căn cứ và phiên bản đã dùng.
- Luôn giữ cho người, không cần chấm điểm: ba cổng cứng (cụm từ cấm mức chắc, ảnh trùng tài khoản khác, giá
  vượt trần), danh mục bật luôn duyệt tay, tài khoản đang bị đánh dấu theo thiết bị.
- Dò cổng cứng: 3 lượt trong 24 giờ thì chờ 24 giờ mới gửi tin mới — thời gian chờ, không phải gậy; chỉ cổng
  cứng được đếm.
- Chấm điểm đủ 12 dấu hiệu của TK 14 (cụm từ cấm mức mơ hồ nằm ở `screening/banned-phrases`), kể cả "danh mục
  rủi ro cao" cộng 20 điểm — đã chốt 08/10: mức rủi ro cao chỉ cộng điểm, không còn giữ mọi tin; "sai danh
  mục" suy ra danh mục rủi ro cao hay luôn duyệt tay thì áp luật của danh mục đó. Ba dải Thấp · Vừa · Cao,
  ngưỡng chỉnh được theo danh mục; ma trận dải × T0–T3, trong đó T1 dải Vừa hiện hạn chế với lý do "máy".
- Cụm từ cấm: hai mức, chỉ nhận cụm từ hai chữ trở lên, so theo ranh giới chữ, không phân biệt dấu, ghép chữ
  cái tách rời, ngoại lệ theo cụm, chạy thử 7 ngày, bật thật thì quét lại và máy rút tin đang hiện về chờ duyệt
  (Đang hiển thị → Chờ duyệt, TK 18), không từ chối.
- Kiểm ảnh: trùng với ảnh của tài khoản khác, danh sách trắng ảnh mẫu của hãng do staff nuôi; tin
  chỉ hiện khi có kết quả cho chữ và mọi ảnh.
- Giải thích cho người đăng: lỗi tự sửa được thì nói cách sửa; tin bị giữ không vì gian lận thì "Tin đang chờ
  người duyệt, thường trong 24 giờ"; mọi dấu hiệu gian lận — cụm từ cấm, ảnh trùng, thiết bị, đăng dồn — dùng
  một câu chung ba phần ("Tin cần kiểm tra an toàn thêm", thời gian chờ ước tính, nút liên hệ hỗ trợ kèm mã tra
  cứu), không nêu tín hiệu, không nhắc thiết bị; master hoặc staff có việc hỗ trợ nhập mã thì thấy lý do cụ
  thể.
- Luật có phiên bản: mã, trọng số, chế độ bật · chạy thử · tắt, giá trị riêng theo danh mục; luật mới chạy
  thử trước; chỉ master chỉnh.
- Tên hiển thị qua bộ lọc cụm từ cấm.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Hàng "có gậy còn hiệu lực" của ma trận (trần T1: dải Thấp hạn chế, dải Vừa giữ); phần "có gậy" của dấu
  hiệu "trùng thiết bị" (30 điểm); đánh dấu tài khoản bắt đầu đăng tin trên máy sau khi tài khoản khác ở đó
  nhận gậy → `add-strikes`. Hệ quả "luôn giữ" ở `screening/hard-gates` đã viết cho mọi đánh dấu theo thiết
  bị, nên `add-strikes` chỉ cần thêm đánh dấu ở `identity/device-registry`.
- Tạo việc cho người: hàng 0 (máy giữ), hàng 3 (hạn chế do máy — dải Vừa của T1), mẫu hậu kiểm (T2, T3 dải
  Vừa; lấy mẫu theo rủi ro), việc của lưới an toàn khi tin đang hiện thiếu kết quả ảnh; việc tự huỷ khi tin
  được sửa và máy cho qua → `add-review-queues`.
- Người duyệt thấy điểm, luật đã trúng, tin cùng ảnh của tài khoản khác; ghi "máy đúng" hay "máy quá tay";
  đo tỉ lệ tin máy giữ mà người cho qua theo từng luật; gỡ lý do hạn chế "máy" khi hậu kiểm cho đạt →
  `add-review-queues`.
- Bộ lọc cụm từ cấm cho tin nhắn → `add-messaging`.
- Kết quả chấm điểm giữ 180 ngày rồi gộp thành số liệu thống kê → `add-data-retention`.
- Đọc chữ trong ảnh — hoãn theo TK 29, không thuộc change nào trong bảy đợt.
- Kiểm ảnh nhạy cảm cho tin và ảnh đại diện → `add-image-moderation`, làm khi chọn được dịch vụ (tách ra
  12/10/2026).

## Capabilities

### New Capabilities

- `screening/machine-decision`: ba kết quả của máy, ghi căn cứ và phiên bản, không chắc thì giữ, lưới an
  toàn 5 phút.
- `screening/hard-gates`: ba cổng cứng, danh mục luôn duyệt tay, tài khoản bị đánh dấu theo thiết bị, dò
  cổng cứng và thời gian chờ.
- `screening/risk-scoring`: dấu hiệu và điểm, dải rủi ro, ma trận dải × mức tin cậy.
- `screening/banned-phrases`: cụm từ cấm hai mức, so khớp, ngoại lệ, chạy thử, bật thật và quét lại.
- `screening/image-checks`: ảnh trùng tài khoản khác, danh sách trắng, ảnh kiểm xong
  trước khi tin hiện.
- `screening/explanations`: câu báo cho người đăng khi tin bị giữ hay hạn chế, câu chung cho dấu hiệu gian
  lận, hỗ trợ tra lý do bằng mã tra cứu.
- `screening/rule-management`: luật có mã, trọng số, chế độ, giá trị riêng theo danh mục, phiên bản.

### Modified Capabilities

- `identity/profile` (tạo bởi `add-identity`; change này archive sau): tên hiển thị qua bộ lọc cụm từ cấm.
- `trust/seller-dashboard` (tạo bởi `add-trust-tiers`; change này archive sau): bảng uy tín cho biết thời gian
  chờ đang áp dụng (TK 20) mà không nêu cổng cứng nào bị trúng.

## Impact

- Module `screening` (mới). Bàn vận hành thêm: cụm từ cấm và ngoại lệ, luật và trọng số, ngưỡng dải theo
  danh mục, danh sách trắng ảnh mẫu, tra lý do theo mã tra cứu cho hỗ trợ.
- Phụ thuộc change trước: `add-identity` (đánh dấu theo thiết bị, gỡ đánh dấu qua hỗ trợ, tuổi tài khoản, hồ
  sơ), `add-platform-roles` (quyền master và staff, việc hỗ trợ người dùng, bảng con số có phiên bản),
  `add-categories` (trần giá, giá tham chiếu, mức rủi ro, luôn duyệt tay),
  `add-media` (ảnh trong kho của hệ thống), `add-listings` (gửi tin, trạng thái đang kiểm · chờ duyệt · đang
  hiển thị, lý do hạn chế `machine`, nơi đăng, vị trí trên bảng tin), `add-trust-tiers` (mức tin cậy lúc
  chấm).
- **Đã chọn 12/10/2026**: gói `sharp` băm ảnh (dHash) để so trùng; việc nền chạy trên pg-boss; "chữ như gõ bừa"
  và "sai danh mục" là luật tay trong code (từ khoá theo danh mục), bật ngay từ đầu; chấm chữ đồng bộ trong lượt gửi
  như TK 30. Dịch vụ kiểm ảnh nhạy cảm hoãn → `add-image-moderation`.
- **Đã chốt 12/10/2026** (design mục 2): tin luôn giữ vẫn chấm đủ; dò cổng cứng đếm theo lượt qua máy, kể cả gửi
  lại; thời gian chờ chỉ chặn tin mới; bật thật cụm mơ hồ không quét lại; quét lại chỉ rút tin đang hiển thị, tin
  bị rút về vẫn trôi ngày; master bật sớm kèm lý do; nhiều cụm mơ hồ cộng một lần; khoảng giá thường thấy [P10 ÷ 2,
  P90 × 2], thiếu mẫu thì không xét; giá trị cao "từ" 2 triệu; dấu hiệu khác chỉ nhận câu chờ, bỏ "thiếu mô tả"; vừa
  tự sửa được vừa gian lận thì nói phần tự sửa được; mỗi lần giữ một mã tra cứu, hỗ trợ chỉ gỡ đánh dấu thiết bị;
  tên trúng cụm chắc hiện "Người dùng Ghim", cụm mơ hồ không áp cho tên; danh sách trắng do mọi staff nuôi; lưới an
  toàn đặt lý do "máy"; "bị giữ nhiều" chỉ đếm giữ vì điểm hay cổng cứng; trùng máy xét 90 ngày; gỡ đánh dấu không
  chấm lại tin đang chờ; lượt qua máy sau khi sửa cho hiện đầy đủ thì gỡ lý do "máy"; cổng cứng chạy thử được,
  không tắt được; máy tính đánh dấu thiết bị kể cả lượt đang xét.
- **Câu hỏi mở**: không còn.
