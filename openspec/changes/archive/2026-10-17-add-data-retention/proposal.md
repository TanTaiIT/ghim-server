# Proposal

## Why

Nguyên tắc 9 (TK 4) chốt: mọi dữ liệu cá nhân có hạn lưu, không gì giữ mãi trừ nhật ký quyết định, và nhật ký
không chứa nội dung tin. TK 25 đặt hạn lưu cho từng loại dữ liệu và đặt luật tạm giữ bằng chứng lên trên mọi hạn
lưu: dữ liệu dính tới một báo cáo, gậy hay khiếu nại đang mở không bị xoá hẳn, kể cả khi các bên tự xoá, cho tới
khi việc đóng thêm 30 ngày (nhắc lại ở TK 3, TK 23, TK 24). TK 26 đặt ba luật cho mọi việc chạy nền và lịch của
việc dọn dữ liệu. TK 7 và TK 22 nêu lại hạn lưu của tài khoản đã xoá, dấu băm email và dữ liệu gậy nghiêm trọng.

Đợt 7 theo TK 29. Cam kết ở TK 27 mà change này đáp ứng: **31** (dữ liệu dính tới báo cáo, gậy, khiếu nại đang mở
không bị xoá hẳn; mọi dữ liệu cá nhân khác có hạn lưu; quyết định giữ mãi nhưng không chứa nội dung tin), một
phần **7** (quá hạn không tự mở tin — thành luật chung cho mọi việc nền), một phần **30** (nháp và tin quá hạn
bị xoá hẳn để ảnh của chúng vào diện dọn).

## What Changes

- Hạn lưu cho từng loại dữ liệu của bảng TK 25: bản nháp, tin bị từ chối / gỡ vì sai sót, tin bị gỡ khỏi nhóm,
  tin bị từ chối / gỡ vì vi phạm, tin tự xoá, tin đã bán, tin hết hạn (kèm nhắc trước 7 ngày), tin của nhóm đã
  đóng, tài khoản đã xoá, dấu băm email kèm gậy, dấu băm email của tài khoản bị khoá vĩnh viễn (giữ tới khi gỡ
  khoá), dữ liệu thiết bị, hội thoại, thông báo, kết quả chấm điểm của máy, gậy (ẩn danh hoá cùng nhật ký liên
  quan), quyết định (giữ mãi, không chứa nội dung tin).
- Tạm giữ bằng chứng: dữ liệu dính tới việc đang mở không bị xoá hẳn — kể cả của tài khoản đã xoá khi báo cáo
  về nó chưa đóng — thắng mọi hạn lưu, gỡ sau khi việc đóng 30 ngày, không làm dữ liệu đã xoá hiện lại.
- Ba luật cho mọi việc nền: không chặn nhau, làm dở thì nói ra, không tự mở tin cho người mua.
- Lịch dọn dữ liệu: mỗi ngày; bản nháp mỗi 6 giờ.

**Cố ý chưa làm trong change này** (đã có chủ ở change trước — không chép lại):

- Ảnh chưa xác nhận quá 48 giờ, ảnh đi theo chủ khi chủ bị xoá hẳn, đối chiếu kho ảnh hằng tháng →
  `media/image-cleanup` (`add-media`). Các dòng "xoá hẳn kèm ảnh" của bảng TK 25 vì vậy chỉ ghi "xoá hẳn"; phần
  "kèm ảnh" là hệ quả của luật ảnh đi theo chủ.
- Tài khoản đăng ký dở dang xoá sau 7 ngày → `identity/registration` (`add-identity`).
- Nhật ký thao tác của bàn vận hành giữ mãi, không ai sửa xoá, không chứa nội dung tin → `platform/audit-log`
  (`add-platform-roles`). Change này chỉ thêm ẩn danh hoá nhật ký liên quan tới gậy và luật giữ mãi cho quyết
  định của người duyệt.
- Việc theo giờ của từng module (trả việc nhận quá 10 phút, lưới an toàn 5 phút, chuyển hết hạn, nhắc 9 giờ sáng,
  tính lại mức mỗi ngày, nhóm thiếu chủ quá 30 ngày, báo hậu kiểm dưới 80%) → capability của module đó.
- Tài khoản đã xoá ẩn ngay; người dùng không tự xoá được tin bị gỡ vì vi phạm; báo cáo vẫn xử trên bản lưu khi
  tin hay tài khoản bị xoá → `identity/account-deletion`, `listing/deletion` (`add-identity`, `add-listings`,
  `add-reports`, `add-strikes`).
- Master xem lại khoá vĩnh viễn mỗi 2 năm, email bị chặn đăng ký tới khi gỡ khoá → `trust/serious-strikes`,
  `identity/registration` (`add-strikes`). Change này chỉ giữ dấu băm email tới khi gỡ khoá.
- Ghi chú của TK 25 rằng toàn bộ bảng hạn lưu, dấu băm email và dấu thiết bị cần luật sư đối chiếu trước khi
  chạy thật — không phải hành vi của hệ thống, nên không thành requirement; xem Câu hỏi mở.

## Capabilities

### New Capabilities

- `ops/data-retention`: hạn lưu và cách xử khi hết hạn cho từng loại dữ liệu của TK 25, kể cả ngoại lệ dấu băm
  email của tài khoản bị khoá vĩnh viễn; ẩn danh hoá gậy; quyết định giữ mãi, không chứa nội dung tin.
- `ops/evidence-hold`: tạm giữ dữ liệu dính tới báo cáo, gậy, khiếu nại đang mở; thắng mọi hạn lưu; gỡ sau 30
  ngày; không làm dữ liệu đã xoá hiện lại.
- `ops/background-jobs`: ba luật chung cho mọi việc nền; lịch của việc dọn dữ liệu.

### Modified Capabilities

Không có.

## Impact

- Module `ops` (mới): dọn dữ liệu, tạm giữ bằng chứng, chạy việc theo lịch. Việc xoá hẳn hay ẩn danh hoá dữ liệu
  của module khác đi qua module sở hữu dữ liệu đó (TK 30: một loại quyết định, một chủ).
- Phụ thuộc change trước, phải archive trước: mọi change đợt 1–6 — dữ liệu được dọn thuộc về các module đó.
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): cơ chế việc nền theo lịch chạy
  trên Postgres, có khoá trùm cả lượt chạy (thay agenda của hệ thống cũ).
- **Đã chốt 08/10** (TK 22, 25, 28 đã sửa theo): khoá vĩnh viễn và dấu băm email không còn mâu thuẫn — dấu băm
  email của tài khoản bị khoá vĩnh viễn giữ tới khi gỡ khoá, master xem lại mỗi 2 năm để giữ tiếp hay gỡ; email
  bị chặn đăng ký tới khi gỡ khoá. Có báo cáo mở vẫn xoá được tài khoản; dữ liệu dính tới báo cáo đó được tạm giữ
  (TK 7, TK 23).
- **Chuyển từ rà soát 15/10/2026** (`docs/RA-SOAT-15-10-2026.md`, đợt 4) — phải xử trong design của change này:
  - **L13**: khoá ngoại `listings.group_id → groups`, `listings.category_id → categories` là `RESTRICT` — xoá hẳn nhóm
    đã đóng hay danh mục đã gỡ bị chặn khi còn tin trỏ tới. Thứ tự dọn phải là tin trước, nhóm / danh mục sau; hoặc đổi
    khoá ngoại khi xoá hẳn nhóm / danh mục thành một bước có chủ (TK 30).
  - Xoá hẳn tài khoản kéo `images` theo khoá ngoại (`uploader_id … ON DELETE CASCADE`) mà không phát
    `media.images.deleted` — dấu ảnh của `screening` (`image_checks`) của các ảnh đó không được dọn (fix-audit-trust-media-low,
    L10 chỉ phủ ba lượt dọn của `media`). Xoá hẳn tài khoản phải đi qua `media` để phát sự kiện, hoặc dọn dấu ảnh theo
    `owner_account_id`.
- **Câu hỏi mở** — TK không nói hoặc tự mâu thuẫn, cần người dùng chốt trước khi viết design:
  - **Rà soát pháp lý (TK 25, TK 29 câu hỏi mở 3):** toàn bộ bảng hạn lưu, dấu băm email (kể cả ngoại lệ giữ tới
    khi gỡ khoá của tài khoản bị khoá vĩnh viễn), dấu thiết bị và việc giữ hội thoại làm bằng chứng cần luật sư
    đối chiếu với quy định bảo vệ dữ liệu cá nhân và quy định về nền tảng trực tuyến trước khi chạy thật. Kết quả
    rà soát có thể đổi mọi con số trong change này.
  - Hạn lưu có nằm trong bảng con số có phiên bản, master chỉnh được không? Cam kết 33 nói mọi con số trong tài
    liệu chỉnh được, nhưng TK 28 chỉ có dữ liệu thiết bị 180 ngày. Spec ghi "(giá trị khởi đầu)" chỉ cho con số
    có ở TK 28.
  - Gậy nghiêm trọng và nhật ký liên quan được ẩn danh hoá 2 năm sau khi khoá (TK 22, TK 25) — đúng lúc master
    xem lại khoá vĩnh viễn lần đầu. Master xem lại dựa trên gì, và ẩn danh hoá có chờ tới khi gỡ khoá không. Spec
    chỉ viết dấu băm email còn giữ dù gậy đã ẩn danh hoá.
  - "Dấu băm email giữ 2 năm cùng gậy": tính từ ngày ra gậy, hay trùng hạn lưu của gậy (2 năm sau khi gậy hết
    hạn)? Spec chỉ viết các ca đúng với cả hai cách.
  - Tin tự xoá có báo cáo mở: dòng bảng TK 25 và TK 19 nói "giữ tới khi báo cáo đóng", luật tạm giữ nói "tới khi
    việc đóng thêm 30 ngày". Spec theo luật tạm giữ vì TK 25 nói mọi hạn lưu nhường cho nó.
  - Gậy nghiêm trọng "đóng" lúc nào đối với tạm giữ: khi master quyết (khoá vĩnh viễn, hạ, huỷ), hay không bao
    giờ khi khoá vĩnh viễn? TK 22 lại nói "dữ liệu liên quan giữ 2 năm kể từ ngày khoá".
  - Phạm vi "dữ liệu dính tới" một báo cáo hay gậy về một người (không về một tin): mọi tin và hội thoại của người
    đó, hay chỉ thứ được nêu trong báo cáo?
  - Dữ liệu cá nhân chưa có dòng nào trong bảng TK 25, trái cam kết 31: báo cáo (kể cả danh tính người báo), điểm
    tin cậy báo cáo, khiếu nại, hồ sơ xác minh giấy tờ, đơn vào nhóm, lời mời, danh sách thành viên của nhóm còn
    hoạt động, danh sách chặn, phiên đăng nhập, tài khoản bỏ không lâu năm.
  - Dữ liệu thiết bị xoá sau 180 ngày, nhưng luật "bắt đầu đăng tin trên máy sau khi tài khoản khác ở đó bị khoá"
    (TK 8) cần nhớ máy của tài khoản bị khoá lâu hơn thế — tài khoản khoá vĩnh viễn thì sao?
  - "Không chứa nội dung tin" có gồm nội dung tin nhắn, tên hiển thị, và lý do người duyệt tự gõ (nếu có) không.
  - Gộp kết quả máy thành số liệu: số liệu nào phải còn tính được sau khi gộp (tỉ lệ máy quá tay theo luật, theo
    danh mục, theo phiên bản bảng con số).
  - Hội thoại có một bên đã xoá tài khoản: có tính là bên đó "đã xoá" hội thoại (để cả hai bên xoá thì xoá hẳn)?
  - "Mới làm được một phần" báo cho ai, ở đâu — bảng trên bàn vận hành hay cảnh báo cho master.
  - Outbox và việc phát sự kiện chéo module (TK 30) thuộc `ops` theo CLAUDE.md nhưng cần từ đợt 1. Đó là phần
    design, không phải requirement, nhưng thứ tự xây cần chốt.
