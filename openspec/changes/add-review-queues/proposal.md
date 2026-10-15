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
- Tác động chéo (đổi trạng thái tin, gỡ lý do hạn chế) theo CLAUDE.md luật 12: gọi đồng bộ khi cần trong cùng lượt,
  còn lại đi qua outbox (đã có).
- **Đã chọn** (15/10/2026): job nền theo lịch dùng pg-boss có sẵn (`src/lib/jobs.ts`), lịch nằm trong code như
  `media.jobs.ts` — mỗi phút, mỗi giờ, mỗi tuần. Nhắc và cảnh báo master đi qua hộp thư thông báo có sẵn (nhóm "tài
  khoản", luôn bật) cùng bảng tồn trên bàn vận hành; không gửi email.
- **Câu hỏi mở — đã chốt 15/10/2026** (người dùng chọn phương án A cho cả 17 câu, sau khi xem tình huống và phương án
  khác của từng câu):
  1. Chuỗi trong nhóm: điều hành cấp cả nhóm và chủ nhóm chỉ thấy việc của đơn vị con khi đơn vị con không còn ai xử
     được (đúng chuỗi TK 16); master luôn thấy mọi việc.
  2. "Dùng chung thiết bị" = hai tài khoản từng đăng tin từ cùng một máy trong 180 ngày (toàn bộ dữ liệu thiết bị còn
     giữ, TK 8). Hệ thống chỉ ghi dấu máy khi đăng tin; ghi thêm dấu máy lúc đăng nhập để bắt tài khoản phụ của staff
     chưa từng đăng tin là việc sau (`docs/VIEC-DANG-DO.md`).
  3. Việc cần hai người tính cả tài khoản dùng chung thiết bị, như luật "không xử việc của mình".
  4. Master bấm Nhận như mọi người và không giành việc người khác đang giữ. Quyết định "đạt" của master không vào mẫu
     5% hậu kiểm người duyệt (nguyên tắc 3); tin vẫn được xét lấy mẫu theo rủi ro.
  5. "Đạt" cho tin máy giữ đưa tin lên đầy đủ, chỉ giữ lý do hạn chế độc lập (tài khoản mới…); không mang lý do "máy"
     và không sinh việc hàng 3 — người vừa xem thay máy.
  6. Người xử bắt buộc chọn "máy đúng" hay "máy quá tay" khi cho đạt việc máy giữ. Tỉ lệ của từng luật tính theo kết
     quả "đạt"; số lần ghi "máy quá tay" hiện kèm.
  7. Máy cho bản sửa qua thì bỏ lý do "máy giữ"; máy cho qua đầy đủ thì bỏ cả lý do "hạn chế do máy"; bản sửa nào cũng
     bỏ lý do "mẫu hậu kiểm" (bản mới lên bảng được xét lấy mẫu lại). Máy vẫn giữ hay vẫn hạn chế thì giữ lý do, không
     kéo dài hạn. Việc hết lý do thì huỷ, còn lý do thì xếp lại hàng theo lý do còn lại.
  8. Người đăng rút tin chờ duyệt về nháp thì việc bị huỷ.
  9. Rời, bị gỡ, bị cấm: việc máy giữ bị huỷ, tin vẫn chờ duyệt kèm lý do ẩn của nhóm; vào lại nhóm hay được gỡ cấm
     mà tin vẫn chờ duyệt không có việc mở thì sinh lại việc hàng 0 với hạn mới.
  10. Đóng nhóm không huỷ việc hàng 4 về tin của nhóm — vi phạm quy định sàn không phụ thuộc nhóm còn hay đóng.
  11. "Gỡ khỏi nhóm" làm như TK 17 (tin rời nhóm, trạng thái không đổi, 30 ngày chuyển lên sàn — đã có ở `listing`);
      không có "khôi phục vào nhóm". Khôi phục tin sàn là thao tác trực tiếp của staff danh mục và master, không qua
      việc. Staff danh mục và master gỡ trực tiếp được một tin sàn đang hiện không có việc mở (TK 6), kèm lý do mẫu, ghi
      nhật ký.
  12. Việc quá hạn đã chuyển master thì người xử ban đầu không còn thấy, không xử được.
  13. Cảnh báo "một nửa số việc sắp chạm hạn" đếm trên toàn hệ thống, gửi master, gộp thành một dòng chưa đọc.
  14. Tỉ lệ hậu kiểm tuần: mẫu số là việc hàng 5 khép lại trong tuần (xử xong + tự huỷ vì quá hạn); không tính việc
      huỷ vì lý do khác, không tính hàng 3. "Bị lật" là người hậu kiểm gỡ tin hoặc gỡ khỏi nhóm.
  15. Lý do mẫu cho "sai sót" do master soạn trên bàn vận hành, dùng chung mọi danh mục; khởi đầu 6 lý do: Ảnh chưa rõ
      sản phẩm · Thiếu thông tin quan trọng · Sai danh mục · Giá ghi sai · Tiêu đề không mô tả món hàng · Trùng tin đã
      đăng.
  16. Lưới an toàn chuyển tin đang hiện thiếu kết quả ảnh sang hạn chế thì sinh việc hàng 3.
  17. Điều hành viên bị bãi nhiệm hay tạm mất vai khi đang nhận việc: việc trả về hàng chờ ngay, như staff bị treo quyền.
