# Proposal

## Why

Tin đăng là lý do Ghim tồn tại: máy duyệt, người duyệt, gậy, nhắn tin đều xoay quanh một tin. TK 12, 15, 18 và
19 chốt một tin đi từ nháp tới lúc rời bảng ra sao: người đăng tự chọn nơi đăng, hệ thống không đoán; trạng
thái chỉ đổi theo đúng các mũi tên của sơ đồ vòng đời, mỗi mũi tên một bên đi; và ba thứ tách riêng — trạng
thái tin, cờ tạm ẩn, mức hiển thị có lý do — để tin tạm ẩn vì nhóm bị khoá hay danh mục bị tắt không bao giờ bị
nhầm với tin bị phạt (TK 4 nguyên tắc 9). TK 7, 9, 10, 11 thêm hệ quả lên tin của khoá / xoá tài khoản, rời nhóm,
khoá / đóng / đổi chế độ nhóm, tắt danh mục, cùng luật giá và khu vực. TK 20 cho lý do hạn chế "tài khoản mới":
mức T0 không có tin nào hiện đầy đủ ở nơi công khai.

Đợt 2 theo TK 29 ("Tin đăng · mức tin cậy · hạn mức"). Cam kết ở TK 27 mà change này đáp ứng: một phần **4**
(tin đang kiểm, chờ duyệt không hiện với người khác), một phần **5** (mũi tên của máy chỉ là cho qua hoặc giữ
cho người — kể cả rút tin đang hiện về chờ duyệt — không bao giờ sang bị từ chối, bị gỡ), một phần **7** (không
việc tự động nào đưa tin lên bảng; tin chờ duyệt quá hạn vẫn chờ), một phần **16** (mũi tên rút tin đang hiện
chứa cụm từ cấm mới về chờ duyệt), **15**, **17**, **19**, **20** (phần hạn mức ở `add-trust-tiers`), **21**,
**22**, một phần **23** (nhóm gỡ được huy hiệu của mình, không gỡ được tin sàn), một phần **30** (mỗi tin tối đa
6 ảnh).

## What Changes

- Nháp: tạo, lưu khi chưa đủ thông tin, chỉ chủ nháp thấy; tối đa 6 ảnh, ảnh đầu là ảnh bìa; tài khoản master
  không đăng tin.
- Nơi đăng: ba mức bắt buộc chọn, tin trong nhóm phải chọn nhóm, tư cách thành viên, người ngoài, người bị cấm,
  nhóm tạm khoá / đã đóng không nhận tin, tự gắn đơn vị con; danh mục đang bật, thông tin theo mẫu và giữ mẫu
  lúc đăng, giá số nguyên đồng (0 = cho tặng), tỉnh và phường bắt buộc ở sàn chung.
- Gửi tin: chưa xác nhận email thì không gửi; mọi điều kiện gửi kiểm trước khi tin rời nháp, thiếu thì báo ngay
  kèm lý do; bấm Đăng hai lần chỉ ra một tin.
- Vòng đời: tám trạng thái, đúng các mũi tên của TK 18 và bên được đi từng mũi tên; mũi tên không có thì trả 409.
  Cờ tạm ẩn và lý do hạn chế không đổi trạng thái.
- Sửa tin: sửa gì qua máy lại, sửa gì không; so giá trị chứ không so ô được gửi; không đổi nơi đăng khi đang có
  việc chờ; chuyển vào nhóm mình không phải thành viên theo luật người ngoài.
- Ngày hiển thị: 30 ngày từ lần lên bảng đầu; sửa không làm mới; dừng khi bị gỡ và khi tạm ẩn không do người
  đăng; chuyển hết hạn mỗi giờ; gia hạn trong 7 ngày cuối (gia hạn sớm: hạn cũ + 30 ngày) hoặc sau khi hết hạn
  (30 ngày từ lúc lên bảng lại), không đẩy lên đầu; nhắc lúc 9 giờ sáng.
- Tạm ẩn: cờ nhiều lý do, hết mọi lý do mới hiện lại đúng như cũ, hiện lại không phụ thuộc hạn mức; khoá / xoá
  tài khoản, rời nhóm (kể cả tin "nhóm công khai" khi nhóm đang tắt nhận tin người ngoài), bị cấm khỏi nhóm (mọi
  tin trong nhóm, kể cả của người ngoài), nhóm tạm khoá / đóng, nhóm sang riêng tư (hạ tin "nhóm công khai" trước,
  tin người ngoài rời nhóm, khoá mức "nhóm công khai" trong lúc chuyển), nhóm sang công khai, tắt nhận tin người
  ngoài không gỡ tin đã gửi, danh mục tắt; chuyển tin đã rời nhóm lên sàn chung trong 30 ngày.
- Mức hiển thị: đầy đủ / hạn chế, lý do "máy" và "tài khoản mới" đặt, gỡ độc lập; luật duy nhất "ai thấy một
  tin"; phạm vi theo nơi đăng; bảng tin chỉ lấy tin đang hiển thị mức đầy đủ.
- Xoá tin: xoá mềm ở mọi trạng thái, chỉ người đăng.
- Hồ sơ công khai liệt kê tin đang bán. Huy hiệu nhóm gắn lên tin sàn chung, tự gỡ khi mất quyền, ẩn theo khi
  nhóm khoá; nhóm gỡ được huy hiệu của mình nhưng không gỡ được tin sàn.

**Cố ý chưa làm trong change này** (làm ở change khác, đúng đợt có đủ phần phụ thuộc):

- Tải ảnh, kho ảnh, nhãn "chưa xác nhận", dọn ảnh → `add-media` (cổng xin tải, xác nhận trong giao dịch lưu, dọn).
  Luật ảnh riêng của nháp và tin (ảnh thuộc chính nháp, xoá hẳn kéo ảnh) nằm ở `listing/drafts`, `listing/deletion`
  của change này — chuyển từ `add-media` ngày 11/10/2026.
- Trần tin sống, nhịp gửi, trần 2 tin của người ngoài mỗi nhóm, đếm lượt gửi (kể cả gửi lại sau sửa, gia hạn),
  tin tạm ẩn không chiếm hạn mức, gia hạn sớm không chiếm thêm chỗ còn gia hạn tin hết hạn cần còn chỗ, cách tính
  T0–T3, bảng uy tín liệt kê tin hạn chế và tin chờ duyệt → `add-trust-tiers` (`trust/quotas`,
  `trust/trust-tiers`, `trust/seller-dashboard`).
- Máy quyết cho qua hay giữ, khi nào đặt lý do "máy", lưới an toàn 5 phút, kết quả máy về muộn, thời gian chờ
  sau 3 lần dính cổng cứng (`429 SUBMISSION_COOLDOWN`), giải thích cho người đăng, tin trùng của chính mình giữ vị
  trí tin cũ, quét lại tin đang hiện khi bật thật cụm từ cấm mới và rút tin chứa cụm đó về chờ duyệt (mũi tên
  của máy có sẵn ở `listing/lifecycle`) → `add-screening`.
- Ai là người duyệt của một tin và quyết định đạt / từ chối / gỡ / khôi phục / gỡ khỏi nhóm; sai sót hay vi
  phạm; việc tự huỷ khi tin được sửa và máy cho qua; đổi người xử khi mở rộng nơi đăng; huỷ việc khi rời nhóm hay
  đóng nhóm; hậu kiểm gỡ lý do "máy"; tin chờ duyệt quá hạn chuyển cấp → `add-review-queues`.
- Tạm ẩn khi nhiều người báo cáo (đặt, gỡ, không mất ngày); tin có báo cáo mở vẫn xoá được → `add-reports`.
- Khiếu nại (ai xét, hạn, hệ quả); tin vi phạm không sửa để gửi lại được (`409 LISTING_UNDER_VIOLATION`) và không
  tự xoá được; lý do hạn chế "gậy" (kể cả tin hiện lại sau tạm ẩn khi người bán có gậy); ngày hiển thị khi khiếu
  nại thắng và khi huỷ gậy nghiêm trọng; khoá đăng tin và gia hạn từ 3 điểm gậy → `add-strikes`.
- Tin đã bán không mở hội thoại mới → `add-messaging`.
- Mọi hạn lưu: nháp, tin tự xoá, tin bị từ chối / gỡ, tin đã bán, tin hết hạn, tin của nhóm đã đóng, tin của tài
  khoản đã xoá → `add-data-retention`.
- Hoãn theo TK 29: phí đăng tin, gói đẩy tin, tin nổi bật, tìm kiếm theo nội dung.
- "Lưu tin" để xem sau (TK 6 có quyền này nhưng chưa phần nào mô tả) → change riêng sau (chốt 12/10/2026).

## Capabilities

### New Capabilities

- `listing/drafts`: tạo nháp, nháp lưu khi chưa đủ, chỉ chủ nháp thấy, master không đăng tin, tối đa 6 ảnh và
  ảnh bìa.
- `listing/placement`: nơi đăng, nhóm và tư cách trong nhóm, người ngoài, đơn vị con, danh mục, mẫu thông tin,
  giá, khu vực.
- `listing/submission`: gửi nháp cho máy duyệt, email đã xác nhận, kiểm điều kiện gửi, bấm Đăng hai lần.
- `listing/lifecycle`: tám trạng thái, mũi tên của từng bên, mũi tên không có thì từ chối.
- `listing/editing`: sửa qua máy lại hay không, so giá trị, khoá nơi đăng khi có việc chờ, chuyển vào nhóm khác.
- `listing/display-period`: 30 ngày hiển thị, dừng và trôi, chuyển hết hạn, gia hạn, nhắc sắp hết hạn.
- `listing/suspension`: cờ tạm ẩn và các lý do do tài khoản, nhóm, danh mục; chuyển tin đã rời nhóm lên sàn
  chung.
- `listing/visibility`: hai mức hiển thị, lý do "máy" và "tài khoản mới", ai thấy một tin, bảng tin.
- `listing/deletion`: người đăng xoá mềm tin của mình.

### Modified Capabilities

- `identity/profile` (tạo bởi `add-identity`; change này archive sau): hồ sơ công khai liệt kê tin đang bán.
- `group/badges` (tạo bởi `add-groups`; change này archive sau): gắn huy hiệu lên tin sàn chung, huy hiệu tự gỡ
  khi mất quyền, ẩn theo khi nhóm khoá, nhóm gỡ huy hiệu của mình nhưng không gỡ được tin sàn.
- `media/image-storage` (tạo bởi `add-media`; change này archive sau): bản sao ảnh cho tin chuyển lên sàn chung.

## Impact

- Module `listing` (mới) — chỉ module này đổi trạng thái tin, cờ tạm ẩn, lý do "tài khoản mới" (CLAUDE.md luật
  11, 13). Đường chuyển trạng thái là bảng thuần có unit test cho mọi mũi tên của TK 18 và cho mọi mũi tên không
  có.
- Phụ thuộc change trước: `add-identity` (tài khoản, xác nhận email, khoá, xoá, hồ sơ), `add-platform-roles`
  (master, bảng con số có phiên bản), `add-groups` (thành viên, đường vào, người bị cấm, chế độ, nhận tin người
  ngoài, khoá, đóng, đơn vị con, quyền mang huy hiệu), `add-categories` (danh mục bật / tắt, mẫu thông tin có
  phiên bản, danh sách khu vực), `add-media` (ảnh trong kho thuộc nháp).
- `add-trust-tiers` (cùng đợt, archive sau) cho mức T0 / T1 của lý do "tài khoản mới" và cho hạn mức lúc gửi;
  `listing` hỏi `trust` đồng bộ (CLAUDE.md luật 12). Mũi tên của máy, người duyệt, người xét khiếu nại có sẵn ở
  `listing` từ đợt này; bên đi chúng tới ở đợt 3, 4, 5.
- Nhận sự kiện khoá / mở khoá / xoá tài khoản, rời / vào nhóm, cấm / gỡ cấm, khoá / mở khoá / đóng / đổi chế độ
  nhóm, tắt / bật danh mục qua outbox (CLAUDE.md luật 12) — bảng outbox và bộ phát đã có từ đợt 1.
- Sự kiện rời nhóm của `group` phải mang thêm trạng thái "nhận tin người ngoài" **đúng lúc rời**: luật tin "nhóm
  công khai" xét tại thời điểm đó, còn bên nghe chạy sau vài giây — đọc lại cài đặt của nhóm lúc xử là sai khi chủ
  nhóm vừa bật / tắt. Sửa payload ở `group` nằm trong tasks của change này.
- **Hạ tầng dùng lại, không thêm gói hay dịch vụ** (chốt 12/10): việc theo lịch (chuyển hết hạn mỗi giờ, nhắc 9
  giờ sáng) chạy trên pg-boss; lời nhắc sắp hết hạn vào hộp thư của `notification` (đã có từ đợt 1); tìm theo từ
  khoá có dấu / không dấu dùng hàm bỏ dấu sẵn có trên Postgres.
- **Thiết kế chung, code tuần tự** (chốt 12/10): design của `add-listings`, `add-trust-tiers`, `add-screening`
  viết cùng lúc để tin đăng có sẵn chỗ cắm cho mức tin cậy và máy duyệt; code và archive theo thứ tự tin đăng →
  mức tin cậy → máy duyệt. Trong lúc chưa có hai phần sau:
  - Cổng mức tin cậy tạm: trả T0 ở production và test; dev chọn mức qua biến môi trường (mặc định T1) để bảng tin
    dev có tin hiển thị đầy đủ. `add-trust-tiers` thay bằng mức tính thật.
  - Máy tạm chỉ ở dev: tự cho qua để app có tin thật mà dựng màn hình; production từ chối khởi động nếu bật (như
    chốt tên DB). Test gọi thẳng mũi tên của máy. `add-screening` gỡ máy tạm.
- **Đã chốt 08/10** (TK 13, 18, 19): gia hạn sớm là mũi tên Đang hiển thị → Đang kiểm của người đăng, đi như sửa
  tin, hạn mới = hạn cũ + 30 ngày; gia hạn sau khi hết hạn tính 30 ngày từ lúc lên bảng lại. Cụm từ cấm mới bật
  thật thì máy rút tin đang hiện chứa cụm đó về chờ duyệt (mũi tên Đang hiển thị → Chờ duyệt), không từ chối thẳng.
- **Đã chốt 12/10** (TK 9, 10, 11, 12, 15, 17, 19):
  - Nhóm: người bị cấm thì mọi tin của họ trong nhóm tạm ẩn, kể cả người ngoài chưa từng vào nhóm; gỡ cấm chỉ gỡ
    lý do "bị cấm". Rời nhóm tách hai lý do: tự rời ("đã rời nhóm", ngày vẫn trôi) và bị gỡ hay bị cấm ("bị gỡ khỏi
    nhóm", ngày dừng); bị cấm cũng dừng ngày. Tin "nhóm công khai" của người rời nhóm tạm ẩn nếu lúc rời nhóm đang
    tắt nhận tin người ngoài, giữ nguyên nếu đang bật; bật lại sau đó không tự hiện tin. Tắt nhận tin người ngoài
    giữ nguyên tin người ngoài đã gửi, chỉ chặn tin mới.
  - "Gỡ khỏi nhóm" (TK 17) không đổi trạng thái tin sang "bị gỡ": tin rời nhóm với lý do "tin bị gỡ khỏi nhóm",
    người đăng có 30 ngày chuyển lên sàn chung như khi nhóm đóng.
  - Chuyển tin đã rời nhóm lên sàn chung là tạo **tin mới** (bản sao nội dung và ảnh, 30 ngày mới, vị trí mới),
    mỗi tin chuyển một lần; 30 ngày là giá trị khởi đầu, thêm vào bảng con số.
  - Gửi tin bắt buộc tiêu đề, giá, ít nhất 1 ảnh; mô tả không bắt buộc. Bấm Đăng hai lần: lượt sau nhận lại đúng
    tin của lượt đầu.
  - Tin chờ máy hay người mà hết ngày hiển thị: được cho qua thì lên bảng rồi chuyển hết hạn ở lượt chạy kế tiếp.
    Gia hạn tin hết hạn nhận kèm sửa trong cùng một lượt qua máy; sửa tin hết hạn mà không gia hạn thì 409.
  - Sửa thông tin theo mẫu theo phiên bản mẫu tin đang mang. Thu hẹp tin T0 về "chỉ thành viên" thì gỡ lý do "tài
    khoản mới".
  - Hồ sơ, tìm kiếm, gợi ý chỉ có tin đang hiển thị; tin đã bán, hết hạn chỉ mở bằng đường link; tin "nhóm công
    khai" chỉ tìm trong nhóm.
  - Mỗi tin tối đa 1 huy hiệu; huy hiệu nhóm đã gỡ khỏi một tin thì người đăng không gắn lại lên tin đó; bật lại
    "hiện tên nhóm" không tự trả huy hiệu đã tự gỡ.
  - Chuyển đi: báo cáo đúng về tin đã bán, hết hạn → câu hỏi mở của `add-reports`; cụm từ cấm mới với tin đã bán,
    hết hạn → đã có trong câu hỏi mở của `add-screening`. "Lưu tin" (TK 6) → change riêng sau, không thuộc change
    này. Cựu thành viên (ra trường) → change sau, như `add-groups` đã ghi.
- **Chốt cùng design 12/10/2026** (D1–D12 của design): tin đã rời nhóm hẳn không sửa được nữa — chỉ chuyển lên
  sàn chung hoặc xoá (`409 LISTING_DETACHED`); tin tạm ẩn vì một nhóm mà đổi nơi đăng ra khỏi nhóm đó thì mất lý
  do của nhóm ấy; mọi lượt gửi bắt buộc mã máy.
- **Câu hỏi mở**: không còn — mọi câu đã chốt 12/10/2026 (mục trên).
