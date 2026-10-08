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
- Luôn giữ cho người, không cần chấm điểm: bốn cổng cứng (cụm từ cấm mức chắc, ảnh nhạy cảm, ảnh trùng tài
  khoản khác, giá vượt trần), danh mục bật luôn duyệt tay, tài khoản đang bị đánh dấu theo thiết bị.
- Dò cổng cứng: 3 lượt trong 24 giờ thì chờ 24 giờ mới gửi tin mới — thời gian chờ, không phải gậy; chỉ bốn
  cổng cứng được đếm.
- Chấm điểm đủ 12 dấu hiệu của TK 14 (cụm từ cấm mức mơ hồ nằm ở `screening/banned-phrases`), kể cả "danh mục
  rủi ro cao" cộng 20 điểm — đã chốt 08/10: mức rủi ro cao chỉ cộng điểm, không còn giữ mọi tin; "sai danh
  mục" suy ra danh mục rủi ro cao hay luôn duyệt tay thì áp luật của danh mục đó. Ba dải Thấp · Vừa · Cao,
  ngưỡng chỉnh được theo danh mục; ma trận dải × T0–T3, trong đó T1 dải Vừa hiện hạn chế với lý do "máy".
- Cụm từ cấm: hai mức, chỉ nhận cụm từ hai chữ trở lên, so theo ranh giới chữ, không phân biệt dấu, ghép chữ
  cái tách rời, ngoại lệ theo cụm, chạy thử 7 ngày, bật thật thì quét lại và máy rút tin đang hiện về chờ duyệt
  (Đang hiển thị → Chờ duyệt, TK 18), không từ chối.
- Kiểm ảnh: nhạy cảm, trùng với ảnh của tài khoản khác, danh sách trắng ảnh mẫu của hãng do staff nuôi; tin
  chỉ hiện khi có kết quả cho chữ và mọi ảnh.
- Giải thích cho người đăng: lỗi tự sửa được thì nói cách sửa; tin bị giữ không vì gian lận thì "Tin đang chờ
  người duyệt, thường trong 24 giờ"; mọi dấu hiệu gian lận — cụm từ cấm, ảnh trùng, thiết bị, đăng dồn — dùng
  một câu chung ba phần ("Tin cần kiểm tra an toàn thêm", thời gian chờ ước tính, nút liên hệ hỗ trợ kèm mã tra
  cứu), không nêu tín hiệu, không nhắc thiết bị; master hoặc staff có việc hỗ trợ nhập mã thì thấy lý do cụ
  thể.
- Luật có phiên bản: mã, trọng số, chế độ bật · chạy thử · tắt, giá trị riêng theo danh mục; luật mới chạy
  thử trước; chỉ master chỉnh.
- Tên hiển thị và ảnh đại diện qua bộ lọc cụm từ cấm và kiểm ảnh nhạy cảm.

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

## Capabilities

### New Capabilities

- `screening/machine-decision`: ba kết quả của máy, ghi căn cứ và phiên bản, không chắc thì giữ, lưới an
  toàn 5 phút.
- `screening/hard-gates`: bốn cổng cứng, danh mục luôn duyệt tay, tài khoản bị đánh dấu theo thiết bị, dò
  cổng cứng và thời gian chờ.
- `screening/risk-scoring`: dấu hiệu và điểm, dải rủi ro, ma trận dải × mức tin cậy.
- `screening/banned-phrases`: cụm từ cấm hai mức, so khớp, ngoại lệ, chạy thử, bật thật và quét lại.
- `screening/image-checks`: kiểm ảnh nhạy cảm, ảnh trùng tài khoản khác, danh sách trắng, ảnh kiểm xong
  trước khi tin hiện.
- `screening/explanations`: câu báo cho người đăng khi tin bị giữ hay hạn chế, câu chung cho dấu hiệu gian
  lận, hỗ trợ tra lý do bằng mã tra cứu.
- `screening/rule-management`: luật có mã, trọng số, chế độ, giá trị riêng theo danh mục, phiên bản.

### Modified Capabilities

- `identity/profile` (tạo bởi `add-identity`; change này archive sau): tên hiển thị qua bộ lọc cụm từ cấm,
  ảnh đại diện qua kiểm ảnh nhạy cảm.
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
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): dịch vụ kiểm ảnh nhạy cảm;
  cách băm ảnh để so trùng xuyên tài khoản (TK 30 gợi ý pHash); job nền cho lưới an toàn 5 phút và lượt quét
  lại khi bật cụm (job nền còn "(chưa có)"); cách nhận "chữ như gõ bừa" và suy ra danh mục thật cho "sai danh
  mục" (luật tay hay mô hình, chạy trong tiến trình hay dịch vụ ngoài).
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Tin dính cổng cứng hay thuộc diện luôn giữ có vẫn được chấm đủ điểm không. TK 13 nói "không cần chấm
    điểm", nhưng TK 17 cho người duyệt thấy "điểm và luật máy đã trúng". Gợi ý: vẫn chấm đủ để người duyệt
    thấy hết. (Phần "danh mục rủi ro cao" của câu này đã chốt 08/10: chỉ cộng 20 điểm, dấu hiệu đã viết ở
    `screening/risk-scoring`.) Câu hỏi mở 1 của TK 29 — danh mục luôn duyệt tay giữ 100% tin hay hạ về chỉ
    giữ T0–T1 — còn mở; change này viết theo TK 13: giữ mọi tin.
  - Dò cổng cứng: "3 lần" đếm theo lượt qua máy hay theo số cổng trúng trong một lượt; lượt qua máy lại sau
    khi sửa có tính không; trong thời gian chờ có được sửa và gửi lại tin đang có không (TK 14 chỉ nói "không
    gửi được tin mới"). Gợi ý: đếm theo lượt, kể cả gửi lại; vẫn cho sửa như luật 3 điểm gậy ở TK 21.
  - Bật thật một cụm mức **mơ hồ** có quét lại và rút tin đang hiện về không. TK 13 nói chung "cụm mới", cam
    kết 16 chỉ nói mức chắc. Change này chỉ viết mức chắc.
  - Lượt quét lại khi bật cụm: tin đã bán, hết hạn chứa cụm vừa bật (người lạ vẫn xem được) thì sao — TK 18
    chỉ có mũi tên Đang hiển thị → Chờ duyệt, nên change này chỉ rút tin đang hiển thị; có quét tên hiển thị
    không; ngày hiển thị của tin bị rút về có tiếp tục trôi không (TK 19 không liệt kê trường hợp này). (Đường
    rút về đã chốt 08/10: mũi tên Đang hiển thị → Chờ duyệt do máy đi, không từ chối.)
  - Master có bật thật một cụm trước khi đủ 7 ngày chạy thử được không.
  - Một tin trúng nhiều cụm mức mơ hồ: cộng 25 điểm một lần hay mỗi cụm 25.
  - "Khoảng thường thấy" của giá tính thế nào (phân vị nào); giá tham chiếu (TK 11 nói dùng để nhận ra giá bất
    thường) có thay cho phân phối khi danh mục chưa đủ 30 tin không.
  - Ngưỡng "giá tham chiếu cao": TK 14 ghi "trên 2 triệu", TK 28 ghi "từ 2 triệu" — giá tham chiếu đúng 2
    triệu thì sao.
  - Dấu hiệu không thuộc danh sách "tự sửa được" lẫn danh sách "gian lận" của TK 13 — gõ bừa, giá 0 ở danh
    mục giá trị cao, trùng tin của mình, bị giữ nhiều, tài khoản mới, ảnh nhạy cảm, danh mục rủi ro cao — có
    được giải thích không. "Thiếu mô tả" có trong danh sách tự sửa được nhưng không ứng với dấu hiệu nào ở TK 14. Gợi ý: chỉ câu chờ.
  - Tin vừa trúng lỗi tự sửa được vừa trúng dấu hiệu gian lận: có giải thích phần tự sửa được không. Gợi ý:
    có, kèm câu chung ba phần và không nêu phần gian lận — đúng như các requirement của
    `screening/explanations` áp độc lập.
  - Mã tra cứu: gắn theo tin hay theo từng lần giữ; còn tra được bao lâu (kết quả chấm giữ 180 ngày); "thời
    gian chờ ước tính" lấy hạn hàng 0 (24 giờ) hay ước theo tồn hàng chờ thật. Hỗ trợ gỡ "khi đúng là nhầm"
    với cụm từ cấm hay ảnh trùng thì gỡ gì — TK chỉ nêu ví dụ đánh dấu thiết bị; change này chỉ viết gỡ đánh
    dấu.
  - Tên hiển thị trúng cụm mức chắc, ảnh đại diện nhạy cảm: từ chối ngay hay giữ chờ người — TK 16 không có
    hàng chờ nào cho hồ sơ. Cụm mức mơ hồ có tác dụng gì với tên. Ảnh đại diện có kiểm trùng không; ảnh đại
    diện lấy từ Google có qua kiểm ảnh không.
  - Danh sách trắng ảnh mẫu "do staff nuôi": mọi staff hay chỉ staff của danh mục liên quan.
  - Lưới an toàn chuyển tin đang hiện thiếu kết quả ảnh sang hạn chế với lý do nào — TK 15 chỉ có ba lý do
    (máy, tài khoản mới, gậy). Gợi ý: "máy".
  - "Bị giữ nhiều" có đếm cả lần giữ vì lỗi của máy, quá 5 phút, hay lần giữ mà người duyệt sau đó cho đạt
    không.
  - "Dùng chung máy với tài khoản bị khoá" xét trong khung thời gian nào (90 ngày như khi đếm tài khoản, hay
    toàn bộ 180 ngày dữ liệu thiết bị).
  - Hỗ trợ gỡ đánh dấu thiết bị thì tin đang chờ vì đánh dấu có được chấm lại không. Gợi ý: không, vẫn chờ
    người (nguyên tắc 2).
  - Tin đang hạn chế lý do "máy" được sửa và lần chấm mới ra dải Thấp: lý do "máy" có được gỡ không — TK 15
    nói chỉ gỡ khi hậu kiểm cho đạt.
  - Luật cổng cứng có chế độ tắt hay chạy thử như luật chấm điểm không.
