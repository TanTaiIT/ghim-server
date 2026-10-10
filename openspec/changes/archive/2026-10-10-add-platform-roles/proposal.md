# Proposal

## Why

Ghim có hai cửa: app cho người dùng và bàn vận hành cho người giữ trật tự sàn. Trước khi có tin, nhóm hay
hàng chờ, hệ thống cần biết ai đứng ở bàn vận hành và được làm gì. TK 5 và TK 6 chốt: master toàn quyền, đúng
một người, quyết định là cuối cùng và mọi thao tác vào nhật ký; staff không phải một loại tài khoản mà là
một quyền master gắn lên tài khoản cá nhân, theo danh mục. TK 28 và TK 30 chốt mọi con số vận hành nằm trong
một bảng có phiên bản, để master chỉnh dần theo kết quả hậu kiểm mà không phát hành lại phần mềm.

Đợt 1 theo TK 29 ("quyền master và staff"). Cam kết ở TK 27 mà change này đáp ứng: **3** (master toàn quyền,
mọi thao tác của master vào nhật ký), một phần **28** (người bị khoá không giữ quyền staff), một phần **31**
(nhật ký giữ mãi nhưng không chứa nội dung tin), một phần **33** (mọi con số master chỉnh được mà không phát
hành lại phần mềm, và tra lại được bộ con số theo phiên bản).

## What Changes

- Master: đúng một tài khoản, chỉ tạo bằng công cụ của đội kỹ thuật, không có đường HTTP; không có luồng thay
  hay bỏ master trong app; vượt mọi kiểm tra phạm vi ở bàn vận hành; thao tác có hiệu lực ngay, không cần
  người thứ hai, là cuối cùng. Mất máy tạo mã thì đội kỹ thuật đặt lại lớp thứ hai bằng công cụ chạy tay.
- Quyền staff: gắn lên tài khoản cá nhân theo danh mục, nhiều staff một danh mục, ba việc toàn hệ thống (hỗ
  trợ người dùng, xử báo cáo về người, duyệt giấy tờ); phạm vi tường minh, có thể chỉ gồm việc toàn hệ thống;
  chỉ master cấp, sửa, thu; thu có hiệu lực ngay; tự treo khi tài khoản bị khoá, chỉ master trả lại.
- Bảng con số có phiên bản: phiên bản đầu mang giá trị TK 28; mỗi lần đổi là một phiên bản mới có hiệu lực
  ngay; phiên bản cũ không đổi và tra lại được; kiểm giá trị; chặn ghi đè khi hai phiên đăng nhập cùng sửa.
- Nhật ký: mọi thao tác ghi của master và staff, ghi cùng lượt với thay đổi, giữ mãi, không ai sửa hay xoá,
  không chứa nội dung tin, chỉ master tra.
- Bộ phát sự kiện outbox tối thiểu (đọc `outbox_events`, gọi bên nghe, đánh dấu đã phát): cần ngay để quyền
  staff tự treo khi `identity` khoá tài khoản mà không gọi chéo module. `ops` (đợt 7) nhận lại và mở rộng.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Đăng nhập hai lớp và tối đa 3 phiên cho master, staff — đã có ở `identity/sessions` (`add-identity`).
- Tài khoản master không vào nhóm → `add-groups` (`group/membership`); không đăng tin → `add-listings`
  (`listing/drafts`); không lưu tin, nhắn tin, báo cáo (TK 6) → change sở hữu từng việc đó (`add-listings`,
  `add-messaging`, `add-reports`).
- Đang có gậy thì quyền staff tự treo, hết gậy thì master quyết có trả lại → `add-strikes` (thêm vào
  `platform/staff-permissions`).
- Quyền staff bị treo hoặc bị thu → việc đang nhận trả về hàng chờ → `add-review-queues` (thêm vào
  `platform/staff-permissions`).
- Không ai trừ master xử việc của chính mình; hàng của master có hạn, nhắc sau 72 giờ; nội dung riêng của
  nhật ký quyết định duyệt (mức độ, quy định, kết quả máy trước đó, hậu quả thật) → `add-review-queues`.
- Gậy do master ra thì master tự xem lại khiếu nại, quyết định cuối cùng → `add-strikes`.
- Mỗi kết quả của máy và mỗi lần tính mức tin cậy ghi lại phiên bản bảng con số đã dùng → `add-screening`,
  `add-trust-tiers`.
- Luật máy có mã, trọng số, chế độ chạy thử, chỉnh riêng theo danh mục; ngưỡng dải rủi ro theo danh mục →
  `add-screening`.
- Ẩn danh hoá nhật ký liên quan tới gậy khi hết hạn lưu → `add-data-retention`.
- Thêm con số của hạn lưu (TK 25), điểm dấu hiệu (TK 14) vào bảng con số → change xây phần đó.

## Capabilities

### New Capabilities

- `platform/master-accounts`: master chỉ do đội kỹ thuật tạo, đúng một người, toàn quyền ở bàn vận hành, thao
  tác có hiệu lực ngay và là cuối cùng.
- `platform/staff-permissions`: quyền staff theo danh mục và ba việc toàn hệ thống trên tài khoản cá nhân;
  cấp, sửa, thu; treo khi tài khoản bị khoá và trả lại.
- `platform/config-versions`: bảng con số có phiên bản, giá trị khởi đầu TK 28, đổi, tra lại, kiểm giá trị,
  chặn ghi đè.
- `platform/audit-log`: nhật ký thao tác của master và staff, giữ mãi, không sửa được, không chứa nội dung
  tin.

### Modified Capabilities

Không có.

## Impact

- Module `platform` (mới). Bàn vận hành dùng cả bốn capability. Mọi module sau đọc con số qua
  `platform/config-versions` và ghi thao tác của master, staff qua `platform/audit-log`.
- Phụ thuộc `add-identity`: tài khoản, khoá và mở khoá tài khoản (treo quyền staff), đăng nhập hai lớp và 3
  phiên cho tài khoản mang quyền staff. Quyền staff theo danh mục cần danh mục của `add-categories`: hai
  change làm chung một lượt apply, archive `add-platform-roles` trước rồi `add-categories`.
- Công cụ tạo master và đặt lại lớp thứ hai là lệnh chạy tay của đội kỹ thuật trong repo, không cần package
  mới. Không có dịch vụ ngoài nào phải chọn cho change này.
- Hạ tầng dùng chung thêm: bảng `audit_log` + `appendAudit(tx, …)` (như outbox, không module nghiệp vụ nào sở
  hữu, `platform` sở hữu cửa đọc) và bộ phát outbox tối thiểu ở `src/common/outbox/dispatcher.ts`.
- **Câu hỏi mở đã chốt** (10/10/2026, người dùng chốt phần in đậm, phần còn lại uỷ quyền cho agent và ghi ở TK
  5, TK 28):
  - Vòng phụ thuộc với `add-categories`: gộp chung một lượt apply; `platform` kiểm danh mục tồn tại qua service
    của `category`.
  - **Master là duy nhất, không thể thay thế**: đúng một master, công cụ từ chối tạo thêm, không có luồng thay
    hay bỏ trong app; mất máy tạo mã thì công cụ chạy tay đặt lại lớp thứ hai.
  - **Staff phải được phân quyền đầy đủ**: phạm vi tường minh theo danh mục và việc; staff chỉ mang việc toàn hệ
    thống, không có danh mục, là hợp lệ.
  - Gắn quyền cho tài khoản đang bị khoá hoặc chưa xác nhận email: từ chối (409 `STAFF_PERMISSION_INELIGIBLE`).
  - Quyền đang treo vẫn là "mang quyền staff" cho hai lớp và trần 3 phiên. Tài khoản vừa được gắn quyền mà đang
    có hơn 3 phiên: không thu hồi ngay, trần áp từ lần đăng nhập kế tiếp; bàn vận hành vẫn đóng cho tới khi
    phiên có lớp thứ hai.
  - Nhật ký: chỉ master đọc; thao tác chỉ đọc và thao tác bị từ chối không ghi.
  - Phạm vi bảng con số: đúng các con số TK 28 ở change này, khoá `phần.tên`; con số của danh mục nằm trong
    phiên bản cài đặt của danh mục; hạn lưu và điểm dấu hiệu thêm vào bảng khi phần đó được xây.
  - Không kiểm ràng buộc chéo giữa các con số; đổi có thể kèm ghi chú; không hẹn giờ hiệu lực.
