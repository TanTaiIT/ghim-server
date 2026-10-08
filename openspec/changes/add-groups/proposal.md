# Proposal

## Why

Nhóm là nơi đăng tin thứ hai của Ghim, bên cạnh sàn chung: bảng tin riêng của một trường, công ty hay cộng
đồng, do chủ nhóm và điều hành viên giữ trật tự. TK 9 và TK 10 chốt nhóm ra đời thế nào (chỉ master lập, phải
có chủ mới nhận thành viên), bốn chế độ quyết định ai tìm thấy và vào bằng cách nào, đường vào của từng người
quyết định huy hiệu, và nhóm mất chủ thì đi qua giai đoạn thiếu chủ có hạn. Tin đăng ở đợt 2 cần sẵn nhóm,
thành viên và quyền mang huy hiệu để biết ai được đăng vào đâu.

Đợt 1 theo TK 29 ("nhóm"). Cam kết ở TK 27 mà change này đáp ứng: một phần **23** (chỉ thành viên vào bằng
đường được xét mới có huy hiệu), **24** (không nhóm nào hoạt động quá 30 ngày mà không có chủ nhóm — với
nguyên nhân "tài khoản chủ nhóm bị khoá"), một phần **22** (nhóm chỉ thành riêng tư sau khi mọi tin "nhóm
công khai" đã hạ), một phần **13** (đang là chủ nhóm thì không tự xoá được tài khoản), một phần **6** (cấm
khỏi nhóm chỉ có tác dụng trong nhóm, không đổi gì trên tài khoản toàn hệ thống).

## What Changes

- Vòng đời nhóm: chỉ master lập; loại nhóm chỉ để chọn sẵn cài đặt; sáu trạng thái và đường chuyển; master
  tạm khoá, mở khoá; chủ nhóm hoặc master đóng vĩnh viễn, huỷ đơn, lời mời, mã nhóm.
- Chế độ: bốn chế độ, không có "riêng tư · mở cửa"; ai tìm thấy nhóm; đổi chế độ, công khai → riêng tư qua
  trạng thái chuyển; nhận tin người ngoài chỉ ở nhóm công khai; kiểu bảng tin.
- Thành viên: thứ tự xét vào nhóm (cấm → mở cửa → đơn → lời mời, danh sách lớp); hạn và giới hạn của đơn;
  lời mời; mã nhóm; đường vào ghi lại và không đổi; đơn vị con; ai xem danh sách thành viên; tự rời, bị gỡ,
  bị cấm; tài khoản master không vào nhóm.
- Vai: master giao chủ lần đầu, chuyển nhượng chủ nhóm, bổ nhiệm và bãi nhiệm điều hành viên, bị khoá thì
  tạm mất vai, thiếu chủ (đề cử, master xác nhận, chủ cũ trở lại, quá 30 ngày hoặc hết điều hành viên thì tạm
  khoá).
- Quyền mang huy hiệu: ai có quyền (đường vào được xét, chế độ nhóm, công tắc hiện tên), bấm tham gia không
  bao giờ có, tính lại ngay khi đổi cách vào hay công tắc, người ngoài bấm huy hiệu nhóm riêng tư chỉ thấy
  tên nhóm.
- Thêm vào `identity/account-deletion`: chủ nhóm phải chuyển chủ trước khi xoá tài khoản.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Mọi ảnh hưởng lên **tin** của nhóm: tin tạm ẩn khi nhóm khoá, khi người đăng rời / bị gỡ / bị cấm; hạ tin
  "nhóm công khai" khi sang riêng tư, tin người ngoài rời nhóm và 30 ngày chuyển lên sàn; không ai đăng mức
  "nhóm công khai" trong lúc chuyển; tin rời bảng khi nhóm đóng, 30 ngày chuyển lên sàn; người bị cấm không
  gửi tin vào nhóm; người ngoài chỉ đăng mức "nhóm công khai" → `add-listings`; tin tự gắn đơn vị con →
  `add-listings` (`listing/placement`).
- Huy hiệu **trên tin**: gắn vào tin, người đăng tự chọn gắn hay không; nhóm gỡ huy hiệu của mình khỏi tin
  nhưng không gỡ được tin sàn; huy hiệu tự gỡ khỏi tin khi người đăng mất quyền; huy hiệu ẩn khi nhóm tạm
  khoá → `add-listings` (thêm vào `group/badges`). Change này chỉ viết **quyền** mang huy hiệu.
- Người ngoài tối đa 2 tin sống mỗi nhóm → `add-trust-tiers` (`trust/quotas`).
- Giữ vai chủ nhóm, điều hành viên cần T1 trở lên → `add-trust-tiers` (thêm vào `group/group-roles`).
- Gậy nặng thì tạm mất vai; chủ nhóm nhận gậy nặng thì nhóm thiếu chủ → `add-strikes` (thêm vào
  `group/group-roles`).
- Đóng nhóm huỷ việc đang chờ của nhóm; rời / bị gỡ / bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ;
  xử tin máy giữ, gỡ tin khỏi nhóm → `add-review-queues`. Báo cáo lừa đảo, hàng cấm của nhóm đã đóng vẫn được
  staff xử → `add-reports`.
- Huy hiệu không làm tin được duyệt dễ hơn → `add-screening` (máy duyệt không dùng huy hiệu làm dấu hiệu).
- Báo người xin vào khi bị từ chối; báo người xin, người được mời khi nhóm đóng; báo trước mọi thành viên khi
  nhóm riêng tư sang công khai; chủ nhóm, điều hành viên gửi thông báo cho cả nhóm → `add-notifications`.
- Hội thoại đã mở vẫn tiếp tục khi một bên rời nhóm → `add-messaging`.
- Dữ liệu của nhóm đã đóng xoá hẳn sau hạn lưu → `add-data-retention`.
- Cựu thành viên (học sinh ra trường, theo năm học) — chờ chốt câu hỏi mở bên dưới rồi mới viết.

## Capabilities

### New Capabilities

- `group/group-lifecycle`: lập nhóm (chỉ master), loại nhóm, trạng thái và đường chuyển, tạm khoá / mở khoá,
  đóng nhóm.
- `group/group-modes`: bốn chế độ, tìm thấy nhóm, đổi chế độ, nhận tin người ngoài, kiểu bảng tin.
- `group/membership`: vào nhóm theo chế độ, đơn, lời mời, danh sách lớp, mã nhóm, đường vào, đơn vị con, danh
  sách thành viên, rời / gỡ / cấm.
- `group/group-roles`: giao và chuyển chủ nhóm, điều hành viên, tạm mất vai khi bị khoá, thiếu chủ.
- `group/badges`: quyền mang huy hiệu nhóm, công tắc hiện tên, tính lại quyền, người ngoài chỉ thấy tên nhóm
  riêng tư.

### Modified Capabilities

- `identity/account-deletion`: chủ nhóm phải chuyển chủ trước khi xoá tài khoản (tạo bởi `add-identity`;
  change này archive sau).

## Impact

- Module `group` (mới). App dùng tìm nhóm, vào nhóm, quản lý thành viên và cài đặt; bàn vận hành dùng lập
  nhóm, giao chủ, khoá nhóm, xác nhận chủ mới.
- Phụ thuộc `add-identity` (tài khoản, khoá / mở khoá tài khoản — nguyên nhân thiếu chủ và tạm mất vai — và
  xoá tài khoản) và `add-platform-roles` (ai là master).
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): cách chạy việc theo lịch
  (job nền) cho "thiếu chủ quá 30 ngày → tạm khoá" (TK 26, mỗi ngày) và đơn tự huỷ sau 21 ngày. Ba luật chung
  của việc nền nằm ở `ops/background-jobs` (`add-data-retention`, đợt 7) — đợt 1 đã cần việc theo lịch trước
  khi change đó có.
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Huy hiệu ở nhóm công khai · xét duyệt: bảng TK 9 ghi "cho người vào qua duyệt hoặc lời mời", còn TK 10
    ghi đủ bốn đường được xét (thêm danh sách lớp, master giao). Spec theo TK 10 — cần xác nhận.
  - Lời giao chủ lần đầu của master có hạn 14 ngày như lời chuyển chủ không?
  - Chuyển chủ: người nhận có phải là thành viên không; chủ cũ sau khi chuyển thành gì (thành viên hay điều
    hành viên); master giao chủ mới cho nhóm đang có chủ thì có cần chủ cũ đồng ý?
  - Thiếu chủ: "lâu năm nhất" tính theo ngày làm điều hành viên cấp cả nhóm hay ngày vào nhóm? Người được đề
    cử có phải bấm đồng ý không; master chọn người khác được không? Nhóm chỉ còn điều hành viên cấp đơn vị
    con thì có tạm khoá ngay không?
  - "Không ai đổi được cài đặt hay bổ nhiệm người mới" trong lúc thiếu chủ có gồm master không (nguyên tắc 3:
    master đứng ngoài mọi luật)?
  - Nhóm tạm khoá vì thiếu chủ quá 30 ngày: mở khoá theo sơ đồ TK 9 thì về "đang hoạt động" mà vẫn không có
    chủ — trái cam kết 24. Gợi ý: chỉ mở khoá được khi đã giao chủ.
  - Sơ đồ TK 9 không có mũi tên khoá hay đóng từ "chờ giao chủ" và "thiếu chủ". Master có huỷ được nhóm chưa
    có chủ, có khoá được nhóm đang thiếu chủ không?
  - Đơn vị con: ai lập, đổi tên, xoá (xoá khi còn thành viên thì sao); nhóm cộng đồng, khác có đơn vị con
    không; ai xếp thành viên vào đơn vị; điều hành viên cấp đơn vị con quản lý thành viên toàn nhóm hay chỉ
    đơn vị mình?
  - Danh sách lớp: ai nạp, nhận ra người bằng gì (email?), có tự xếp người vào đơn vị con không?
  - Lời mời gửi theo tài khoản hay theo email (mời người chưa có tài khoản)? Đổi mã nhóm là việc của chủ nhóm
    (sửa cài đặt) hay cả điều hành viên?
  - Cựu thành viên: ai chuyển, tự động theo năm học hay bằng tay; cựu thành viên còn huy hiệu, còn thấy tin
    "chỉ thành viên" không?
  - Riêng tư → công khai "báo trước": đổi có hiệu lực ngay sau khi báo, hay sau một khoảng báo trước (bao
    lâu)? Công tắc "hiện tên" mặc định thế nào khi nhóm công khai vừa thành riêng tư?
  - Đổi cách vào (xét duyệt → mở cửa, có mã → chỉ lời mời) thì đơn đang chờ và mã nhóm xử thế nào?
  - Cấm người ngoài chưa từng là thành viên (người gửi tin vào nhóm công khai) có được không; có gỡ cấm được
    không, ai gỡ?
  - Nhóm tạm khoá: có cần lý do không; trong lúc khoá điều hành viên còn quản lý thành viên, cài đặt không?
