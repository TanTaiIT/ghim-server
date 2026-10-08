# Proposal

## Why

Máy duyệt (đợt 3) chỉ có hai lối ra: cho qua, hoặc giữ cho người. Phần máy giữ cần một người thật xử trong
hạn, còn phần máy cho qua cần người xem lại một ít để biết máy để lọt gì. TK 16 và TK 17 chốt cách làm: sáu
hàng chờ có hạn xử, nhận việc 10 phút, mỗi tin tối đa một việc mở, không ai trừ master xử việc của chính mình
kể cả qua tài khoản dùng chung thiết bị (TK 8), quá hạn chỉ chuyển cấp, hậu kiểm, và đường chuyển lên của
điều hành nhóm (TK 6).

Đợt 4 theo TK 29 ("người duyệt: hàng máy giữ trước, rồi báo cáo, khiếu nại, hậu kiểm"). Cam kết ở TK 27 mà
change này đáp ứng: **1**, **2** (trừ phần khiếu nại), **6**, **7**, **8**, **27**, và một phần **3** (mọi
quyết định, kể cả của master, vào nhật ký quyết định), **21** (khôi phục thì ngày hiển thị chạy tiếp), **28**
(quyền staff bị treo thì việc đang nhận trả về hàng chờ).

## What Changes

- Sáu hàng chờ với hạn xử. Hàng 0 (máy giữ), 3 (hạn chế do máy), 4 (chuyển từ nhóm), 5 (mẫu hậu kiểm) chạy đủ
  trong change này; hàng 1 (báo cáo) và hàng 2 (khiếu nại gậy) chỉ được khai cùng hạn xử.
- Việc vào hàng của ai: tin sàn theo danh mục, không theo khu vực; tin nhóm theo phạm vi của điều hành nhóm —
  trừ danh mục đặt "tin nhóm bị giữ do sàn duyệt" thì tin nhóm bị máy giữ vào hàng staff danh mục, kể cả nhóm
  riêng tư (đã chốt 08/10, TK 11, 12, 16; mức rủi ro không quyết ai xử); danh mục chưa có staff thì vào hàng
  master. Việc sinh ra khi máy rút tin đang hiện về chờ duyệt vì cụm từ cấm mới cũng vào hàng 0.
- Một tin một việc mở: gộp lý do, hạn sớm nhất, người xử theo hàng số nhỏ nhất. Việc chỉ có lý do máy giữ tự
  huỷ khi máy cho bản sửa qua.
- Quá hạn chỉ chuyển master, không bao giờ tự mở tin; hàng master quá 72 giờ thì nhắc mỗi ngày; cảnh báo khi
  một nửa số việc sắp chạm hạn.
- Nhận việc giữ 10 phút, tự trả về, chỉ người đang nhận mới quyết, việc bị chuyển chỗ thì mất quyền quyết,
  người xử thấy đủ bối cảnh.
- Không ai trừ master xử việc của mình hay của tài khoản dùng chung thiết bị; chuỗi chuyển tiếp trong nhóm và
  trên sàn; việc cần hai người do hai người làm.
- Kết quả: đạt, từ chối / gỡ — sai sót (kèm lý do mẫu), gỡ khỏi nhóm, khôi phục; quyết định ghi có điều kiện
  theo phiên bản tin; nhật ký quyết định.
- Hậu kiểm: lấy mẫu theo rủi ro, hậu kiểm 5% quyết định "đạt", tỉ lệ bị lật, mẫu quá hạn tự huỷ, báo master
  khi làm xong dưới 80%.
- Điều hành nhóm chuyển tin trái quy định sàn lên hàng 4; staff bác; quyết định của nhóm chỉ có tác dụng trong
  nhóm.
- Thêm vào capability của change trước: đóng nhóm huỷ việc; rời / bị gỡ / bị cấm huỷ việc máy giữ; quyền staff
  bị treo hay bị thu thì việc đang nhận trả về; đo tỉ lệ "máy quá tay" theo từng luật.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Hàng 1 — gửi báo cáo, ai xử, gộp báo cáo (lừa đảo, hàng cấm thắng), quá hạn, tạm ẩn khi nhiều người báo,
  điểm báo cáo, báo cáo liên quan trong màn xử việc → `add-reports`.
- Hàng 2 — ai xét khiếu nại (gậy thường, nặng: staff khác người ra gậy, gậy của master thì master tự xem lại;
  gậy nghiêm trọng: chỉ master — master kia nếu chính master ra gậy, staff chỉ ghi nhận xét), quá hạn (gậy
  thường tự thắng; gậy nặng chuyển master, giữ nguyên; gậy nghiêm trọng nhắc master mỗi ngày, tài khoản vẫn
  khoá) → `add-strikes` (`trust/appeals`). Change này chỉ khai hàng 2 cùng hạn xử 7 ngày.
- Từ chối / gỡ — vi phạm kèm gậy và điều trích; xác nhận việc nhóm chuyển lên (kèm gậy); gậy và điều trích
  trong nhật ký quyết định → `add-strikes` (thêm vào `review/decisions`). Lịch sử gậy của người bán trong màn
  xử việc (TK 17) → `add-strikes` (thêm vào `review/task-handling`).
- Đưa thông báo tới người nhận (hộp thư, điện thoại) → `add-notifications`; change này chỉ nói khi nào ai được
  báo.
- Nhật ký quyết định giữ mãi, ẩn danh hoá theo gậy → `add-data-retention`.
- Không đổi nơi đăng khi tin đang chờ duyệt, bị báo cáo, đang hậu kiểm → đã có ở `listing/editing`
  (`add-listings`).

## Capabilities

### New Capabilities

- `review/queues`: sáu hàng chờ và hạn xử, việc sinh ra khi nào và vào hàng của ai, một tin một việc mở, quá
  hạn chỉ chuyển cấp, nhắc hàng master, cảnh báo sắp chạm hạn.
- `review/task-handling`: nhận việc 10 phút, tự trả về hàng chờ, chỉ người đang nhận mới quyết, việc bị chuyển
  chỗ, người xử thấy gì.
- `review/conflict-of-interest`: không xử việc của mình kể cả qua tài khoản dùng chung thiết bị, chuỗi chuyển
  tiếp trong nhóm và trên sàn, master đứng ngoài, việc cần hai người.
- `review/decisions`: đạt, từ chối / gỡ — sai sót, gỡ khỏi nhóm, khôi phục; ghi có điều kiện; còn quyền lúc
  quyết; nhật ký quyết định.
- `review/post-review`: lấy mẫu theo rủi ro, hậu kiểm quyết định của người duyệt, tỉ lệ bị lật, mẫu quá hạn
  tự huỷ, báo master khi làm không xuể.
- `review/group-escalation`: điều hành nhóm chuyển tin lên hàng 4, staff bác, quyết định của nhóm chỉ có tác
  dụng trong nhóm.

### Modified Capabilities

- `group/group-lifecycle` (tạo bởi `add-groups`; change này archive sau): đóng nhóm huỷ việc máy giữ, hạn chế
  do máy và mẫu hậu kiểm về tin trong nhóm.
- `group/membership` (tạo bởi `add-groups`; change này archive sau): rời, bị gỡ, bị cấm thì việc máy giữ trong
  nhóm của người đó bị huỷ.
- `platform/staff-permissions` (tạo bởi `add-platform-roles`; change này archive sau): quyền staff bị treo hay
  bị thu thì việc đang nhận trả về hàng chờ.
- `screening/rule-management` (tạo bởi `add-screening`; change này archive sau): đo theo từng luật tỉ lệ tin
  máy giữ mà người cho qua, master xem được.

## Impact

- Module `review` (mới) — module duy nhất ghi quyết định của người (CLAUDE.md luật 11, 16, 17). Bàn vận hành:
  hàng chờ, nhận việc, quyết định, bảng tồn của master, tỉ lệ bị lật, tỉ lệ máy quá tay. App Ghim: điều hành
  nhóm xử việc của nhóm.
- Phụ thuộc change trước: `add-identity` (khoá tài khoản, dấu thiết bị), `add-platform-roles` (quyền staff
  theo danh mục, treo và thu quyền, bảng con số có phiên bản), `add-groups` (vai, phạm vi đơn vị con, rời /
  gỡ / cấm, đóng nhóm), `add-categories` (danh mục, cài đặt "tin nhóm bị giữ do ai duyệt"), `add-listings`
  (trạng thái tin, lý do hạn chế, ngày hiển thị, mũi tên của người duyệt), `add-trust-tiers` (mức tin cậy, tin
  sạch), `add-screening` (kết quả máy, điểm, luật đã trúng, ảnh trùng, lưới an toàn, rút tin về khi bật cụm).
- Tác động chéo (đổi trạng thái tin, gỡ lý do hạn chế) đi qua outbox — bảng outbox còn "(chưa có)" (CLAUDE.md
  luật 12).
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): job nền chạy theo lịch — mỗi
  phút (trả việc nhận quá 10 phút, chuyển cấp việc quá hạn), mỗi giờ (lấy mẫu, nhắc master, cảnh báo sắp chạm
  hạn), mỗi tuần (báo hậu kiểm); job nền còn "(chưa có)" và `ops/background-jobs` tới đợt 7 mới có. Kênh nhắc
  và cảnh báo master trước khi có hộp thư (đợt 6): chỉ trên bàn vận hành, hay cả email.
- **Câu hỏi mở** — TK không nói hoặc tự mâu thuẫn, cần người dùng chốt trước khi viết design:
  - Chuỗi chuyển tiếp trong nhóm: điều hành viên cấp cả nhóm và chủ nhóm thấy việc của mọi đơn vị con ngay từ
    đầu, hay chỉ khi đơn vị con không còn ai xử được?
  - "Tài khoản dùng chung thiết bị" xét từ lượt đăng tin (như `identity/device-registry`) hay cả phiên đăng
    nhập — staff ít khi đăng tin từ máy mình, nên chỉ xét lượt đăng tin thì tài khoản phụ có thể lọt; và xét
    trong 90 ngày hay toàn bộ 180 ngày dữ liệu thiết bị.
  - Việc cần hai người (người xử hàng 4 khác người đề nghị, người hậu kiểm khác người đã duyệt) có tính cả tài
    khoản dùng chung thiết bị như luật "không xử việc của mình" không.
  - Master có phải bấm Nhận như mọi người, có quyết thay người đang nhận được không; quyết định "đạt" của
    master có nằm trong 5% hậu kiểm người duyệt không (nguyên tắc 3 "không cơ chế kiểm soát master" đối với
    cam kết 27).
  - "Đạt" cho tin máy giữ mà ma trận ghi "hạn chế, chờ hậu kiểm" (vd tin T1 dải Vừa bị giữ vì cổng cứng): tin
    lên đầy đủ, hay mang lý do "máy" và sinh việc hàng 3?
  - "Máy đúng / máy quá tay": người xử tự chọn hay hệ thống suy ra; tỉ lệ "máy quá tay" của luật tính theo
    kết quả "đạt" (TK 13) hay theo nhận định người xử ghi (TK 17) khi hai thứ khác nhau.
  - Việc đã gộp nhiều lý do mà máy cho bản sửa qua: chỉ bỏ lý do máy giữ hay huỷ cả việc; tin đang hạn chế lý
    do "máy" (hàng 3) hay đang trong mẫu (hàng 5) được sửa thì việc ra sao.
  - Người đăng rút tin đang chờ duyệt về nháp thì việc bị huỷ hay giữ (TK 18 có mũi tên, TK 16 không nói).
  - Rời / bị gỡ / bị cấm: tin chờ duyệt của người đó trong nhóm đi về đâu sau khi việc bị huỷ.
  - Đóng nhóm: việc hàng 4 về tin của nhóm (đang ở chỗ staff) bị huỷ hay vẫn xử — TK 10 chỉ nêu ngoại lệ cho
    báo cáo lừa đảo, hàng cấm.
  - Gỡ khỏi nhóm đưa tin sang "bị gỡ" hay chỉ bỏ nơi đăng (cùng câu hỏi ở `add-listings`); ai khôi phục tin
    trong nhóm; khôi phục là thao tác trực tiếp hay qua một việc; staff có gỡ trực tiếp một tin sàn không có
    việc mở không (TK 6 "gỡ, khôi phục tin sàn").
  - Việc quá hạn đã chuyển master: người xử ban đầu còn thấy và xử được không.
  - Cảnh báo "một nửa số việc sắp chạm hạn": đếm trên toàn hệ thống, từng hàng hay từng người; gửi cho ai.
  - Tỉ lệ hậu kiểm làm xong trong tuần: mẫu số là việc sinh trong tuần hay việc tới hạn trong tuần; hàng 3 có
    tính không. "Bị lật" chỉ khi người hậu kiểm gỡ tin, hay cả khi gỡ khỏi nhóm.
  - Danh sách lý do mẫu cho "sai sót": ai soạn, có theo danh mục không.
  - Lưới an toàn sinh việc ở hàng nào (0 hay 3) cho tin đang hiện thiếu kết quả ảnh.
  - Điều hành viên bị bãi nhiệm hay tạm mất vai khi đang nhận việc: việc trả về ngay như staff bị treo quyền,
    hay chờ hết 10 phút.
