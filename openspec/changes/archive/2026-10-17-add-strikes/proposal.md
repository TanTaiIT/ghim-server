# Proposal

## Why

Ghim phạt bằng gậy có hạn (TK 1, quyết định 12): máy không phạt, chỉ staff hoặc master ra gậy khi xác nhận vi
phạm, phải trích một điều trong quy định sàn, và người bị phạt luôn biết ngày hết. TK 21 chốt ba loại gậy và hạn
chế theo điểm; TK 22 chốt khiếu nại một lần, ân xá và gậy nghiêm trọng. Gậy chạm vào gần như mọi phần đã có —
mức tin cậy (TK 20), mức hiển thị (TK 15), ma trận máy (TK 14), tài khoản và thiết bị (TK 7, TK 8), quyền staff
và vai trong nhóm (TK 5, TK 10) — nên phần lớn change này là thêm luật vào capability của các change trước.

Đợt 5 theo TK 29. Cam kết ở TK 27 mà change này đáp ứng: **9** (mọi gậy có người ra, có điều được trích, có ngày
hết hạn trừ gậy nghiêm trọng), **10** (khiếu nại một lần, người xét khác người ra gậy), phần gậy của **13**
(đăng ký lại kế thừa gậy; gậy nặng, nghiêm trọng chặn tự xoá), phần gậy của **28** (đang có gậy thì không giữ
quyền staff); cùng phần gậy của **1**, **2**, **5**, **6**.

## What Changes

- Gậy: ba loại (thường, nặng, nghiêm trọng) với điểm và ngày hết hạn; chỉ sinh từ quyết định vi phạm của staff
  hoặc master; điểm tự giảm khi gậy hết hạn; từ 3 điểm tạm khoá đăng tin.
- Khiếu nại: một lần trong 14 ngày, người xét khác người ra gậy, hạn xét 7 ngày; quá hạn thì gậy thường tự
  thắng, gậy nặng chuyển master và giữ nguyên, gậy nghiêm trọng (vốn ở master) nhắc master mỗi ngày và tài
  khoản vẫn khoá.
- Ân xá: master huỷ một hay nhiều gậy của một người, bắt buộc ghi lý do, hệ quả như khiếu nại thắng.
- Gậy nghiêm trọng: khoá ngay, không có hạn, khiếu nại 30 ngày qua kênh hỗ trợ không cần đăng nhập, chỉ master
  chọn một trong ba (khoá vĩnh viễn, hạ thành gậy nặng, huỷ) — master kia nếu chính master ra gậy; staff chỉ
  ghi nhận xét vào hồ sơ; không bao giờ tự mở khoá. Khoá vĩnh viễn chặn email đăng ký tới khi gỡ khoá; master
  xem lại mỗi 2 năm để giữ tiếp hay gỡ.
- Thêm vào capability của change trước:
  - quyết định vi phạm kèm gậy, xác nhận việc nhóm chuyển lên, báo cáo đúng kèm gậy, nhật ký ghi hậu quả thật
    (`review/decisions`);
  - lý do hạn chế "gậy" (`listing/visibility`); tin vi phạm không tự xoá được (`listing/deletion`); ngày hiển
    thị khi khiếu nại thắng và khi huỷ gậy nghiêm trọng (`listing/display-period`);
  - hàng "có gậy" của ma trận, dấu hiệu dùng chung máy với tài khoản có gậy (`screening/risk-scoring`). Tin của
    tài khoản bị đánh dấu "dùng máy của tài khoản có gậy" tự được giữ cho người theo luật chung "mọi đánh dấu
    theo thiết bị" ở `screening/hard-gates` — không cần luật riêng;
  - trần T1, điều kiện gậy của T3, gậy bị huỷ coi như chưa có (`trust/trust-tiers`); danh sách gậy và ngày hết
    tạm khoá đăng tin (`trust/seller-dashboard`);
  - đăng ký lại kế thừa gậy, kể cả gậy ra sau khi tài khoản đã xoá; chặn email của tài khoản khoá vĩnh viễn
    tới khi gỡ khoá (`identity/registration`); gậy theo cả email cũ lẫn
    mới (`identity/email-change`); gậy nặng, nghiêm trọng chặn tự xoá (`identity/account-deletion`); đánh dấu
    tài khoản bắt đầu đăng tin trên máy sau khi máy có tài khoản nhận gậy (`identity/device-registry`);
  - treo quyền staff khi có gậy, hết gậy thì master quyết trả lại (`platform/staff-permissions`);
  - gậy nặng làm tạm mất vai, chủ nhóm nhận gậy nặng thì nhóm thiếu chủ (`group/group-roles`).

**Cố ý chưa làm trong change này** (làm ở change sau, hoặc đã có ở change trước):

- Mọi hạn lưu liên quan tới gậy — gậy và nhật ký liên quan, dấu băm email (kể cả dấu băm của tài khoản khoá
  vĩnh viễn, giữ tới khi gỡ khoá), nội dung tin bị gỡ vì vi phạm, dữ liệu của gậy nghiêm trọng →
  `add-data-retention` (`ops/data-retention`); dữ liệu dính tới gậy hay khiếu nại
  đang mở không bị xoá hẳn → `add-data-retention` (`ops/evidence-hold`).
- Hội thoại dính tới gậy, khiếu nại đang mở không bị xoá hẳn → `add-data-retention` (`ops/evidence-hold`).
- Thông báo khi nhận gậy, khi khiếu nại có kết quả, khi mức tin cậy đổi vì gậy → `add-notifications`.
- Việc đang nhận của staff bị treo quyền trả về hàng chờ → đã có ở `add-review-queues`
  (`platform/staff-permissions`).
- Diễn tiến của trạng thái thiếu chủ (đề cử, master xác nhận, quá 30 ngày tạm khoá) → đã có ở `add-groups`
  (`group/group-lifecycle`); change này chỉ thêm việc gậy nặng của chủ nhóm đưa nhóm vào trạng thái đó.
- Khoá tài khoản làm tin tạm ẩn, treo quyền staff, mất vai trong nhóm → đã có ở `add-listings`,
  `add-platform-roles`, `add-groups`; gậy nghiêm trọng chỉ kích hoạt khoá.

## Capabilities

### New Capabilities

- `trust/strikes`: ba loại gậy, điểm và hạn; gậy chỉ sinh từ quyết định vi phạm của staff hoặc master; điểm tự
  giảm khi hết hạn; từ 3 điểm tạm khoá đăng tin.
- `trust/appeals`: khiếu nại một lần trong 14 ngày, người xét khác người ra gậy, hạn xét 7 ngày, quá hạn,
  thắng, thua.
- `trust/amnesty`: master huỷ gậy kèm lý do, hệ quả như khiếu nại thắng.
- `trust/serious-strikes`: khoá ngay, kênh hỗ trợ không cần đăng nhập, chỉ master quyết một trong ba (master kia
  nếu chính master ra gậy), staff chỉ ghi nhận xét, không tự mở khoá, khoá vĩnh viễn chặn email tới khi gỡ khoá
  và được master xem lại mỗi 2 năm.

### Modified Capabilities

- `review/decisions` (tạo bởi `add-review-queues`; change này archive sau): quyết định vi phạm kèm gậy, xác nhận
  việc nhóm chuyển lên, báo cáo đúng kèm gậy (kể cả với tài khoản đã xoá), nhật ký ghi gậy và mức tin cậy sau
  quyết định.
- `listing/visibility` (tạo bởi `add-listings`; change này archive sau): lý do hạn chế "gậy".
- `listing/deletion` (tạo bởi `add-listings`; change này archive sau): tin bị gỡ vì vi phạm không tự xoá được.
- `listing/display-period` (tạo bởi `add-listings`; change này archive sau): ngày hiển thị khi khiếu nại thắng,
  trả ngày khi huỷ gậy nghiêm trọng.
- `screening/risk-scoring` (tạo bởi `add-screening`; change này archive sau): hàng "có gậy" của ma trận, dấu
  hiệu dùng chung thiết bị với tài khoản có gậy.
- `review/task-handling` (tạo bởi `add-review-queues`; change này archive sau): người xử việc thấy lịch sử gậy
  của người bán (TK 17).
- `trust/trust-tiers` (tạo bởi `add-trust-tiers`; change này archive sau): trần T1, điều kiện gậy của T3, gậy bị
  huỷ coi như chưa có.
- `trust/seller-dashboard` (tạo bởi `add-trust-tiers`; change này archive sau): danh sách gậy, ngày hết tạm khoá
  đăng tin.
- `identity/registration` (tạo bởi `add-identity`; change này archive sau): đăng ký lại kế thừa gậy, email của
  tài khoản khoá vĩnh viễn bị chặn tới khi gỡ khoá.
- `identity/email-change` (tạo bởi `add-identity`; change này archive sau): gậy theo cả email cũ lẫn mới.
- `identity/account-deletion` (tạo bởi `add-identity`; change này archive sau): gậy nặng, nghiêm trọng chặn tự
  xoá.
- `identity/device-registry` (tạo bởi `add-identity`; change này archive sau): đánh dấu "dùng máy của tài khoản
  có gậy".
- `platform/staff-permissions` (tạo bởi `add-platform-roles`; change này archive sau): có gậy thì treo quyền
  staff, hết gậy thì master quyết trả lại.
- `group/group-roles` (tạo bởi `add-groups`; change này archive sau): gậy nặng làm tạm mất vai, chủ nhóm nhận gậy
  nặng thì nhóm thiếu chủ.

## Impact

- Module `trust` (thêm gậy, khiếu nại, ân xá, gậy nghiêm trọng) — chỉ `trust` ghi gậy (CLAUDE.md luật 11). Tác
  động lên `identity` (khoá, dấu băm email, thiết bị), `platform` (quyền staff), `group` (vai, thiếu chủ),
  `listing` (lý do hạn chế, ngày hiển thị, xoá tin), `screening` (ma trận) đi qua outbox. `review` gọi `trust`
  để ra gậy khi ghi quyết định vi phạm. Bàn vận hành thêm xét khiếu nại, ân xá, quyết gậy nghiêm trọng.
- Phụ thuộc mọi change đợt 1–4: `add-identity`, `add-platform-roles`, `add-groups`, `add-listings`,
  `add-trust-tiers`, `add-screening`, `add-review-queues`, `add-reports`.
- **Phải chọn trước khi làm**: không cần dịch vụ ngoài mới. Kênh hỗ trợ không cần đăng nhập dùng lại dịch vụ
  email chọn ở `add-identity`. Gậy hết hạn trong ngày và lời nhắc master mỗi ngày cần việc chạy theo lịch —
  dùng cơ chế chạy nền đã chọn cho hàng chờ ở `add-review-queues`; chưa chọn thì phải hỏi trước.
- **Đã chốt 08/10** (TK đã sửa theo, spec viết theo): khiếu nại gậy nghiêm trọng chỉ master xét, master kia
  nếu chính master ra gậy, staff chỉ ghi nhận xét, quá hạn nhắc master mỗi ngày và vẫn khoá (TK 4, 6, 16, 22);
  khoá vĩnh viễn chặn email tới khi gỡ khoá, master xem lại mỗi 2 năm (TK 22, 25, 28); dấu hiệu gian lận, kể
  cả theo thiết bị, chỉ dùng câu chung kèm mã tra cứu (TK 8, 13 — phần câu báo thuộc `add-screening`); gậy ra
  cho tài khoản đã xoá đi theo email, đăng ký lại kế thừa (TK 7, 23).
- **Câu hỏi mở** — TK không nói rõ hoặc tự mâu thuẫn, cần người dùng chốt trước khi viết design:
  - Staff nào được ghi nhận xét vào hồ sơ gậy nghiêm trọng: staff danh mục của gậy, staff việc an toàn, mọi
    staff? Người đã ra gậy và tài khoản dùng chung thiết bị với người bị khoá có được ghi không? Spec chỉ nói
    "staff".
  - Master gỡ khoá ở lần xem lại 2 năm: gậy nghiêm trọng thành gì (huỷ, hay vẫn nằm trong lịch sử như đã quyết),
    tin tạm ẩn từ lúc khoá có hiện lại không. TK 25 ẩn danh hoá gậy nghiêm trọng 2 năm sau khi khoá — đúng lúc
    lần xem lại đầu tiên — nên master xem lại dựa trên gì. Spec chỉ viết mở khoá và hết chặn email.
  - Việc chờ master quyết gậy nghiêm trọng có ngay lúc ra gậy hay chỉ khi người bị khoá khiếu nại; không ai khiếu
    nại trong 30 ngày thì sao.
  - Master dùng thao tác mở khoá thường (`identity/account-lock`) với tài khoản đang có gậy nghiêm trọng chưa
    quyết thì chặn, hay coi như một trong ba lựa chọn. Cùng câu hỏi với tài khoản khoá vĩnh viễn trước lần xem
    lại 2 năm: gỡ khoá được bất kỳ lúc nào, hay chỉ ở lần xem lại.
  - Tin tới ngày hết hạn trong lúc bị khoá vì gậy nghiêm trọng, rồi gậy bị huỷ: TK 19 bảo trả lại ngày đã mất,
    nhưng sơ đồ TK 18 không có mũi tên "Hết hạn → Đang hiển thị".
  - Hạ thành gậy nặng khi đã quá 180 ngày kể từ ngày ra gậy: gậy nặng hết hạn ngay lúc hạ?
  - Quyền staff khi gậy bị huỷ (khiếu nại thắng, ân xá): tự trả lại vì "coi như chưa có" (TK 20), hay master quyết
    như khi gậy hết hạn (TK 5).
  - Chủ nhóm nhận gậy nặng: gậy bị huỷ hay hết hạn trước khi có chủ mới thì nhóm có trở lại với chủ cũ như khi mở
    khoá (TK 10) không; gậy nặng 180 ngày dài hơn hạn thiếu chủ 30 ngày.
  - Tin đang hiển thị được sửa nội dung hoặc gia hạn khi người bán có 1 điểm: qua máy lại theo hàng "có gậy" thì
    thành hạn chế, nhưng TK 15 chỉ nói "tin mới". Spec chưa viết ca này.
  - Gậy ra cho tài khoản đã xoá đi theo email (đã chốt 08/10), nhưng nếu email đã xoá không đăng ký lại được
    trong 90 ngày (câu hỏi mở của `add-identity`) thì gậy thường (90 ngày) gần như không bao giờ được kế thừa.
  - "Quy định sàn": ai soạn danh sách điều, có phiên bản không, gậy giữ bản trích lúc ra gậy hay chỉ mã điều.
  - Khiếu nại 14 / 30 ngày tính từ lúc ra gậy hay từ lúc người nhận được báo. Spec tính từ khi nhận gậy.
  - Con số "không nhận gậy trong 90 ngày" của T3 không có ở TK 28; spec ghi là giá trị khởi đầu.
  - Người xử việc thấy lịch sử gậy của người bán (TK 17): bảng phân công chưa giao cho capability nào
    (`review/task-handling` do `add-review-queues` tạo, viết trước khi có gậy).
